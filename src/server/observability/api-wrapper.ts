import { NextResponse } from "next/server";

import { normalizeError } from "@/server/observability/errors";
import { recordTraceEvent } from "@/server/observability/event-log";
import { createTraceContext, runWithTraceContext } from "@/server/observability/trace-context";

type RouteHandler<TContext> = (request: Request, context: TContext) => Promise<Response> | Response;

export function withApiTrace<TContext>(
  options: {
    subsystem: string;
    operation: string;
  },
  handler: RouteHandler<TContext>,
) {
  return async function tracedRouteHandler(request: Request, context: TContext) {
    const url = new URL(request.url);
    const traceId = request.headers.get("x-cip-trace-id") || undefined;
    const traceContext = createTraceContext({ traceId });
    const started = Date.now();

    return runWithTraceContext(traceContext, async () => {
      await recordTraceEvent({
        severity: "info",
        eventType: "api.request.started",
        subsystem: options.subsystem,
        operation: options.operation,
        status: "started",
        httpMethod: request.method,
        httpPath: url.pathname,
        metadata: {
          search: Object.fromEntries(url.searchParams.entries()),
          userAgent: request.headers.get("user-agent"),
        },
      });

      try {
        const response = await handler(request, context);
        const durationMs = Date.now() - started;
        const tracedResponse = await withTraceHeaderAndErrorBody(response, traceContext.traceId);
        const status = tracedResponse.status >= 400 ? "failed" : "succeeded";

        await recordTraceEvent({
          severity: tracedResponse.status >= 500 ? "error" : tracedResponse.status >= 400 ? "warn" : "info",
          eventType: `api.request.${status}`,
          subsystem: options.subsystem,
          operation: options.operation,
          status,
          durationMs,
          httpMethod: request.method,
          httpPath: url.pathname,
          httpStatus: tracedResponse.status,
        });

        return tracedResponse;
      } catch (error) {
        const normalized = normalizeError(error);
        const durationMs = Date.now() - started;
        await recordTraceEvent({
          severity: "error",
          eventType: "api.request.failed",
          subsystem: options.subsystem,
          operation: options.operation,
          status: "failed",
          error,
          durationMs,
          httpMethod: request.method,
          httpPath: url.pathname,
          httpStatus: normalized.status,
        });

        const response = NextResponse.json(
          {
            error: normalized.safeMessage,
            errorCode: normalized.errorCode,
            traceId: traceContext.traceId,
          },
          { status: normalized.status },
        );
        response.headers.set("x-cip-trace-id", traceContext.traceId);
        return response;
      }
    });
  };
}

async function withTraceHeaderAndErrorBody(response: Response, traceId: string) {
  response.headers.set("x-cip-trace-id", traceId);
  if (response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) {
    return response;
  }

  try {
    const body = await response.clone().json();
    if (!body || typeof body !== "object" || Array.isArray(body) || "traceId" in body) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("x-cip-trace-id", traceId);
    return NextResponse.json({ ...body, traceId }, { status: response.status, headers });
  } catch {
    return response;
  }
}


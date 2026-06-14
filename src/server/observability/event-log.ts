import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { normalizeError } from "@/server/observability/errors";
import { redactSensitiveValue } from "@/server/observability/redaction";
import { getTraceContext } from "@/server/observability/trace-context";

export type TraceSeverity = "debug" | "info" | "warn" | "error" | "fatal";

type RecordTraceEventInput = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  severity?: TraceSeverity;
  eventType: string;
  subsystem: string;
  operation: string;
  status?: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  error?: unknown;
  durationMs?: number;
  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;
  userId?: string;
  organizationId?: string;
  projectId?: string;
  analysisJobId?: string;
  runId?: string;
  promptRunId?: string;
  aiUsageLogId?: string;
  objectType?: string;
  objectId?: string;
  metadata?: unknown;
};

const LOG_LEVEL_ORDER: Record<TraceSeverity, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export async function recordTraceEvent(input: RecordTraceEventInput) {
  const context = getTraceContext();
  const severity = input.severity ?? "info";
  if (!shouldLog(severity)) return null;

  const normalizedError = input.error ? normalizeError(input.error) : null;
  const event = {
    traceId: input.traceId ?? context?.traceId ?? randomUUID(),
    spanId: input.spanId ?? context?.spanId ?? randomUUID(),
    parentSpanId: input.parentSpanId ?? context?.parentSpanId,
    severity,
    eventType: input.eventType,
    subsystem: input.subsystem,
    operation: input.operation,
    status: input.status,
    message: input.message,
    errorCode: input.errorCode ?? normalizedError?.errorCode,
    errorMessage: input.errorMessage ?? normalizedError?.safeMessage,
    durationMs: input.durationMs,
    httpMethod: input.httpMethod,
    httpPath: input.httpPath,
    httpStatus: input.httpStatus,
    userId: input.userId ?? context?.userId,
    organizationId: input.organizationId ?? context?.organizationId,
    projectId: input.projectId ?? context?.projectId,
    analysisJobId: input.analysisJobId ?? context?.analysisJobId,
    runId: input.runId ?? context?.runId,
    promptRunId: input.promptRunId,
    aiUsageLogId: input.aiUsageLogId,
    objectType: input.objectType,
    objectId: input.objectId,
    metadataJson: redactSensitiveValue(input.metadata) as Prisma.InputJsonValue | undefined,
  };

  if (process.env.CIP_LOG_DB_ENABLED === "false" || !isDatabaseConfigured()) {
    await writeFallback(event);
    return null;
  }

  try {
    const created = await getPrisma().traceEvent.create({
      data: event,
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    await writeFallback({
      ...event,
      loggingFailure: normalizeError(error),
    });
    return null;
  }
}

function shouldLog(severity: TraceSeverity) {
  const configured = (process.env.CIP_LOG_LEVEL as TraceSeverity | undefined) ?? "info";
  return LOG_LEVEL_ORDER[severity] >= (LOG_LEVEL_ORDER[configured] ?? LOG_LEVEL_ORDER.info);
}

async function writeFallback(event: unknown) {
  const line = `${JSON.stringify({ at: new Date().toISOString(), event: redactSensitiveValue(event) })}\n`;
  const path = process.env.CIP_LOG_FILE_PATH;
  if (path) {
    await appendFile(path, line, "utf8").catch(() => undefined);
  }
  console.error(line.trim());
}


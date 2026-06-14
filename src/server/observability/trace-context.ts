import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  organizationId?: string;
  projectId?: string;
  analysisJobId?: string;
  runId?: string;
};

const traceStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext() {
  return traceStorage.getStore();
}

export function enrichTraceContext(input: Partial<Omit<TraceContext, "traceId" | "spanId">>) {
  const current = traceStorage.getStore();
  if (!current) return;
  Object.assign(current, {
    userId: input.userId ?? current.userId,
    organizationId: input.organizationId ?? current.organizationId,
    projectId: input.projectId ?? current.projectId,
    analysisJobId: input.analysisJobId ?? current.analysisJobId,
    runId: input.runId ?? current.runId,
  });
}

export function createTraceContext(input: Partial<TraceContext> = {}): TraceContext {
  return {
    traceId: input.traceId ?? randomUUID(),
    spanId: input.spanId ?? randomUUID(),
    parentSpanId: input.parentSpanId,
    userId: input.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    analysisJobId: input.analysisJobId,
    runId: input.runId,
  };
}

export function childTraceContext(input: Partial<TraceContext> = {}): TraceContext {
  const current = getTraceContext();
  return createTraceContext({
    ...current,
    ...input,
    traceId: input.traceId ?? current?.traceId,
    parentSpanId: input.parentSpanId ?? current?.spanId,
    spanId: input.spanId ?? randomUUID(),
  });
}

export function runWithTraceContext<T>(context: TraceContext, fn: () => T) {
  return traceStorage.run(context, fn);
}

export function withTraceContext(input: Partial<TraceContext>) {
  return childTraceContext(input);
}

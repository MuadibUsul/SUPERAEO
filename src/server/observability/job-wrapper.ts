import { recordTraceEvent } from "@/server/observability/event-log";
import { childTraceContext, runWithTraceContext } from "@/server/observability/trace-context";

export async function withJobTrace<T>(
  input: {
    traceId: string;
    subsystem: string;
    operation: string;
    projectId?: string;
    analysisJobId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
  },
  fn: () => Promise<T>,
) {
  const context = childTraceContext({
    traceId: input.traceId,
    projectId: input.projectId,
    analysisJobId: input.analysisJobId,
    runId: input.runId,
  });
  const started = Date.now();

  return runWithTraceContext(context, async () => {
    await recordTraceEvent({
      severity: "info",
      eventType: "job.started",
      subsystem: input.subsystem,
      operation: input.operation,
      status: "started",
      projectId: input.projectId,
      analysisJobId: input.analysisJobId,
      runId: input.runId,
      metadata: input.metadata,
    });

    try {
      const result = await fn();
      await recordTraceEvent({
        severity: "info",
        eventType: "job.succeeded",
        subsystem: input.subsystem,
        operation: input.operation,
        status: "succeeded",
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      await recordTraceEvent({
        severity: "error",
        eventType: "job.failed",
        subsystem: input.subsystem,
        operation: input.operation,
        status: "failed",
        error,
        durationMs: Date.now() - started,
      });
      throw error;
    }
  });
}


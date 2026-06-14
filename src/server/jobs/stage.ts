import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { recordTraceEvent } from "@/server/observability/event-log";

export async function updateAnalysisJobStage(input: {
  analysisJobId?: string;
  stage: string;
  message?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.analysisJobId) return;

  const prisma = getPrisma();
  const job = await prisma.analysisJob.findUnique({
    where: { id: input.analysisJobId },
    select: { result: true, traceId: true, projectId: true, runId: true, jobType: true },
  });
  const current = asRecord(job?.result);
  const history = Array.isArray(current.stageHistory) ? current.stageHistory : [];

  await prisma.analysisJob.update({
    where: { id: input.analysisJobId },
    data: {
      result: {
        ...current,
        currentStage: input.stage,
        stageMessage: input.message,
        stageHistory: [
          ...history,
          {
            stage: input.stage,
            message: input.message,
            metadata: input.metadata,
            at: new Date().toISOString(),
          },
        ],
      } as Prisma.InputJsonValue,
    },
  });
  await recordTraceEvent({
    traceId: job?.traceId,
    severity: "info",
    eventType: "job.stage.changed",
    subsystem: "job",
    operation: job?.jobType ?? "analysis_job",
    status: "running",
    message: input.message,
    projectId: job?.projectId ?? undefined,
    runId: job?.runId ?? undefined,
    analysisJobId: input.analysisJobId,
    objectType: "AnalysisJob",
    objectId: input.analysisJobId,
    metadata: { stage: input.stage, ...input.metadata },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import type { Prisma } from "@/generated/prisma/client";

import { getPrisma } from "@/server/db";
import { runFullDiagnosis } from "@/server/diagnosis/diagnosis-service";
import { runBrandProbeRun } from "@/server/brand-probes/probe-runner";
import { normalizeError } from "@/server/observability/errors";
import { recordTraceEvent } from "@/server/observability/event-log";
import { withJobTrace } from "@/server/observability/job-wrapper";
import { generateLongTailOpportunitySnapshot, buildQuestionTerritorySnapshot } from "@/server/opportunity/opportunity-service";
import { getQueueNames, isRedisConfigured } from "@/server/queue/client";
import { executeSamplingRun } from "@/server/sampling/execute-run";
import { buildSemanticNebulaSnapshots } from "@/server/semantic-nebula/nebula-service";

if (!isRedisConfigured()) {
  console.error("REDIS_URL is not configured. The BullMQ worker cannot start.");
  process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

const samplingWorker = new Worker(
  getQueueNames().samplingRun,
  async (job) => {
    const payload = job.data as { runId: string; requestedByUserId?: string };
    const prisma = getPrisma();
    await prisma.analysisJob.updateMany({
      where: { queueJobId: job.id },
      data: { status: "running", startedAt: new Date() },
    });
    await prisma.analysisJob.updateMany({
      where: { queueJobId: job.id },
      data: { attempts: { increment: 1 } },
    });
    const analysisJob = await prisma.analysisJob.findFirst({ where: { queueJobId: job.id } });

    try {
      const run = await withJobTrace(
        {
          traceId: analysisJob?.traceId ?? `sampling_run:${payload.runId}`,
          subsystem: "worker",
          operation: "sampling_run",
          projectId: analysisJob?.projectId ?? undefined,
          runId: payload.runId,
          analysisJobId: analysisJob?.id,
          metadata: { queueName: job.queueName, queueJobId: job.id },
        },
        () => executeSamplingRun(payload.runId, payload.requestedByUserId),
      );
      await prisma.analysisJob.updateMany({
        where: { queueJobId: job.id },
        data: { status: "completed", completedAt: new Date(), result: { runId: run.id, status: run.status } },
      });
      return run;
    } catch (error) {
      const normalized = normalizeError(error, {
        errorCode: "SAMPLING_WORKER_FAILED",
        message: "采样任务失败，请重试或联系管理员。",
        status: 500,
      });
      await prisma.analysisJob.updateMany({
        where: { queueJobId: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          error: `${normalized.safeMessage} Trace ID: ${analysisJob?.traceId ?? "unknown"}`,
        },
      });
      await recordTraceEvent({
        traceId: analysisJob?.traceId,
        severity: "error",
        eventType: "worker.job.failed",
        subsystem: "worker",
        operation: "sampling_run",
        status: "failed",
        error,
        projectId: analysisJob?.projectId ?? undefined,
        runId: payload.runId,
        analysisJobId: analysisJob?.id,
        metadata: { queueName: job.queueName, queueJobId: job.id },
      });
      throw error;
    }
  },
  { connection },
);

const semanticWorker = new Worker(
  getQueueNames().semanticIntelligence,
  async (job) => {
    const prisma = getPrisma();
    const analysisJob = await prisma.analysisJob.findFirst({ where: { queueJobId: job.id } });
    await prisma.analysisJob.updateMany({
      where: { queueJobId: job.id },
      data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const payload = job.data as {
        projectId: string;
        subjectId?: string;
        runId?: string;
        brandProbeRunId?: string;
        requestedByUserId?: string;
      };
      const result: unknown = await withJobTrace(
        {
          traceId: analysisJob?.traceId ?? `${job.name}:${job.id}`,
          subsystem: "worker",
          operation: job.name,
          projectId: payload.projectId,
          runId: payload.runId,
          analysisJobId: analysisJob?.id,
          metadata: { queueName: job.queueName, queueJobId: job.id, brandProbeRunId: payload.brandProbeRunId },
        },
        async () => {
          if (job.name === "full_diagnosis") {
            return runFullDiagnosis({
              projectId: payload.projectId,
              requestedByUserId: payload.requestedByUserId,
              analysisJobId: analysisJob?.id,
            });
          }
          if (job.name === "brand_probe_run") {
            if (!payload.brandProbeRunId) {
              throw new Error("brand_probe_run requires brandProbeRunId.");
            }
            return runBrandProbeRun({
              runId: payload.brandProbeRunId,
              analysisJobId: analysisJob?.id,
            });
          }
          if (job.name === "semantic_nebula_build") {
            return buildSemanticNebulaSnapshots({
              projectId: payload.projectId,
              subjectId: payload.subjectId,
              runId: payload.runId,
              analysisJobId: analysisJob?.id,
            });
          }
          if (job.name === "long_tail_opportunity_generation") {
            return generateLongTailOpportunitySnapshot({
              projectId: payload.projectId,
              subjectId: payload.subjectId,
              requestedByUserId: payload.requestedByUserId,
              analysisJobId: analysisJob?.id,
            });
          }
          if (job.name === "question_territory_build") {
            return buildQuestionTerritorySnapshot({
              projectId: payload.projectId,
              subjectId: payload.subjectId,
              analysisJobId: analysisJob?.id,
            });
          }
          throw new Error(`Unsupported semantic intelligence job: ${job.name}`);
        },
      );

      const latestAnalysisJob = analysisJob
        ? await prisma.analysisJob.findUnique({ where: { id: analysisJob.id } })
        : analysisJob;

      await prisma.analysisJob.updateMany({
        where: { queueJobId: job.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          result: mergeResult(latestAnalysisJob?.result, { output: summarizeWorkerOutput(result) }) as Prisma.InputJsonValue,
        },
      });
      return result;
    } catch (error) {
      const normalized = normalizeError(error, {
        errorCode: "SEMANTIC_WORKER_FAILED",
        message: "语义智能任务失败，请重试或联系管理员。",
        status: 500,
      });
      await prisma.analysisJob.updateMany({
        where: { queueJobId: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          error: `${normalized.safeMessage} Trace ID: ${analysisJob?.traceId ?? "unknown"}`,
        },
      });
      await recordTraceEvent({
        traceId: analysisJob?.traceId,
        severity: "error",
        eventType: "worker.job.failed",
        subsystem: "worker",
        operation: job.name,
        status: "failed",
        error,
        projectId: analysisJob?.projectId ?? undefined,
        runId: analysisJob?.runId ?? undefined,
        analysisJobId: analysisJob?.id,
        metadata: { queueName: job.queueName, queueJobId: job.id },
      });
      throw error;
    }
  },
  { connection },
);

samplingWorker.on("ready", () => console.log("CIP sampling worker ready."));
semanticWorker.on("ready", () => console.log("CIP semantic intelligence worker ready."));
samplingWorker.on("failed", (job, error) => console.error(`Job ${job?.id} failed`, error));
semanticWorker.on("failed", (job, error) => console.error(`Job ${job?.id} failed`, error));

function mergeResult(current: unknown, patch: Record<string, unknown>) {
  return {
    ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
    ...patch,
  };
}

function summarizeWorkerOutput(result: unknown) {
  if (Array.isArray(result)) {
    return { ids: result.map((item) => (item && typeof item === "object" && "id" in item ? String(item.id) : null)).filter(Boolean) };
  }
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if ("reportId" in record || "semanticNebulaSnapshotIds" in record) {
      return record;
    }
    return {
      snapshotId: idOf(record.snapshot),
      territorySnapshotId: idOf(record.territorySnapshot),
      id: idOf(record),
    };
  }
  return result;
}

function idOf(value: unknown) {
  return value && typeof value === "object" && "id" in value ? String(value.id) : undefined;
}

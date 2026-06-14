import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { Prisma } from "@/generated/prisma/client";

import { getPrisma } from "@/server/db";
import { recordTraceEvent } from "@/server/observability/event-log";

const QUEUE_NAMES = {
  samplingRun: "sampling.run",
  responseAnalyze: "response.analyze",
  graphBuild: "entity.graph.build",
  reportGenerate: "report.generate",
  semanticIntelligence: "semantic.intelligence",
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

let redisConnection: IORedis | null = null;
const queues = new Map<QueueName, Queue>();

export function getQueueNames() {
  return QUEUE_NAMES;
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

function getRedisConnection() {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is not configured.");
  }

  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
  }

  return redisConnection;
}

export function getQueue(name: QueueName) {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      }),
    );
  }

  return queues.get(name)!;
}

export async function enqueueAnalysisJob(input: {
  queueName: QueueName;
  jobType:
    | "full_diagnosis"
    | "brand_probe_run"
    | "sampling_run"
    | "response_analysis"
    | "stability_analysis"
    | "semantic_coverage"
    | "graph_build"
    | "report_generation"
    | "semantic_nebula_build"
    | "long_tail_opportunity_generation"
    | "question_territory_build"
    | "opportunity_probe_sampling";
  projectId?: string;
  runId?: string;
  payload: Prisma.InputJsonValue;
  traceId: string;
}) {
  let queueJobId: string | undefined;

  if (isRedisConfigured()) {
    const job = await getQueue(input.queueName).add(input.jobType, input.payload);
    queueJobId = job.id;
  }

  const analysisJob = await getPrisma().analysisJob.create({
    data: {
      projectId: input.projectId,
      runId: input.runId,
      jobType: input.jobType,
      queueName: input.queueName,
      queueJobId,
      traceId: input.traceId,
      payload: input.payload,
      status: "queued",
    },
  });

  await recordTraceEvent({
    traceId: input.traceId,
    severity: "info",
    eventType: "queue.job.enqueued",
    subsystem: "queue",
    operation: input.jobType,
    status: "queued",
    projectId: input.projectId,
    runId: input.runId,
    analysisJobId: analysisJob.id,
    objectType: "AnalysisJob",
    objectId: analysisJob.id,
    metadata: {
      queueName: input.queueName,
      queueJobId,
      redisQueued: Boolean(queueJobId),
    },
  });

  return { analysisJob, queueJobId, redisQueued: Boolean(queueJobId) };
}

export async function checkQueueHealth() {
  if (!isRedisConfigured()) {
    return { ok: false, message: "REDIS_URL is not configured. Jobs will stay in database queue state." };
  }

  try {
    await getRedisConnection().ping();
    return { ok: true, message: "Redis reachable." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Redis health check failed.",
    };
  }
}

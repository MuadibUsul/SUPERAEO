import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { AnalysisJob, Prisma } from "@/generated/prisma/client";

import { getPrisma } from "@/server/db";
import { recordTraceEvent } from "@/server/observability/event-log";
import { connectedControlRedis } from "@/server/redis-control";

const QUEUE_NAMES = {
  samplingRun: "sampling.run",
  responseAnalyze: "response.analyze",
  graphBuild: "entity.graph.build",
  reportGenerate: "report.generate",
  semanticIntelligence: "semantic.intelligence",
} as const;

const QUEUE_REDIS_OPTIONS = {
  connectTimeout: 1000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
};

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export type { QueueName };

export type QueueDepth = {
  queueName: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
  prioritized: number;
  waitingChildren: number;
};

let redisConnection: IORedis | null = null;
const queues = new Map<QueueName, Queue>();

export function getQueueNames() {
  return QUEUE_NAMES;
}

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function isKnownQueueName(name: string): name is QueueName {
  return Object.values(QUEUE_NAMES).includes(name as QueueName);
}

function getRedisConnection() {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is not configured.");
  }

  if (!redisConnection) {
    redisConnection = new IORedis(process.env.REDIS_URL!, QUEUE_REDIS_OPTIONS);
    redisConnection.on("error", (error) => {
      console.error("Queue Redis connection error", error);
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
  enqueueToRedis?: boolean;
}) {
  const analysisJob = await getPrisma().analysisJob.create({
    data: {
      projectId: input.projectId,
      runId: input.runId,
      jobType: input.jobType,
      queueName: input.queueName,
      traceId: input.traceId,
      payload: input.payload,
      status: "queued",
    },
  });

  return enqueueReservedAnalysisJob({
    analysisJob,
    enqueueToRedis: input.enqueueToRedis,
  });
}

/**
 * Publishes a job whose durable database record already exists. The BullMQ ID
 * is the AnalysisJob ID, and it is written to PostgreSQL before Redis receives
 * the job. This removes the worker race where a fast worker could start before
 * its AnalysisJob row was queryable.
 */
export async function enqueueReservedAnalysisJob(input: {
  analysisJob: AnalysisJob;
  enqueueToRedis?: boolean;
}) {
  const prisma = getPrisma();
  const queueName = input.analysisJob.queueName;
  if (!isKnownQueueName(queueName)) {
    throw new Error(`Unknown queue name: ${queueName}`);
  }

  const shouldEnqueue = isRedisConfigured() && input.enqueueToRedis !== false;
  let analysisJob = input.analysisJob;
  let queueJobId: string | undefined;

  if (shouldEnqueue) {
    queueJobId = analysisJob.id;
    analysisJob = await prisma.analysisJob.update({
      where: { id: analysisJob.id },
      data: { queueJobId },
    });

    const queue = getQueue(queueName);
    try {
      await queue.add(analysisJob.jobType, analysisJob.payload, { jobId: queueJobId });
    } catch (error) {
      // A network timeout can happen after Redis accepted the command. Keep the
      // durable row if the deterministic BullMQ job exists; otherwise release
      // the reservation so a retry is safe.
      const accepted = await queue.getJob(queueJobId).catch(() => null);
      if (!accepted) {
        await prisma.analysisJob.delete({ where: { id: analysisJob.id } }).catch(() => null);
        throw error;
      }
    }
  }

  await recordTraceEvent({
    traceId: analysisJob.traceId,
    severity: "info",
    eventType: "queue.job.enqueued",
    subsystem: "queue",
    operation: analysisJob.jobType,
    status: "queued",
    projectId: analysisJob.projectId ?? undefined,
    runId: analysisJob.runId ?? undefined,
    analysisJobId: analysisJob.id,
    objectType: "AnalysisJob",
    objectId: analysisJob.id,
    metadata: {
      queueName,
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
    // Shares the control connection instead of opening and tearing down a
    // socket per call — getQueueDepths invokes this on every request.
    const connection = await connectedControlRedis();
    await connection.ping();
    return { ok: true, message: "Redis reachable." };
  } catch (error) {
    return {
      ok: false,
      message: redisHealthErrorMessage(error),
    };
  }
}

export async function getQueueDepths(): Promise<QueueDepth[]> {
  if (!isRedisConfigured()) {
    return [];
  }

  const health = await checkQueueHealth();
  if (!health.ok) return [];

  return Promise.all(
    Object.values(QUEUE_NAMES).map(async (queueName) => {
      try {
        const counts = await getQueue(queueName).getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
          "completed",
          "paused",
          "prioritized",
          "waiting-children",
        );

        return {
          queueName,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
          paused: counts.paused ?? 0,
          prioritized: counts.prioritized ?? 0,
          waitingChildren: counts["waiting-children"] ?? 0,
        };
      } catch (error) {
        console.error(`Failed to read queue depth for ${queueName}`, error);
        return {
          queueName,
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
          completed: 0,
          paused: 0,
          prioritized: 0,
          waitingChildren: 0,
        };
      }
    }),
  );
}

export async function closeQueueConnections() {
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  queues.clear();

  if (redisConnection) {
    const connection = redisConnection;
    redisConnection = null;
    await connection.quit().catch(() => connection.disconnect(false));
  }
}

function redisHealthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Redis health check failed.";
  }

  if (error.message === "Connection is closed." || error.message.includes("ECONNREFUSED")) {
    return "Redis is not reachable.";
  }

  return error.message;
}

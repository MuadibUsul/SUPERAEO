import { getQueueNames, isRedisConfigured } from "@/server/queue/client";
import { closeControlRedis, connectedControlRedis } from "@/server/redis-control";

export const WORKER_HEARTBEAT_KEY = "cip:worker:heartbeat";
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;
export const WORKER_HEALTH_STALE_MS = WORKER_HEARTBEAT_TTL_SECONDS * 1000;

/**
 * The contract between the web tier and the worker: job payload shapes and the
 * queue names they are published on. Bump ONLY when an older worker would
 * mishandle a job the current web tier enqueues.
 *
 * This is deliberately not a data-format version such as `semanticNebulaVersion`.
 * Those change every time an output shape is tuned, and gating on them meant any
 * rolling deploy that updated the web tier first took audits offline until every
 * worker had restarted.
 */
export const WORKER_PROTOCOL_VERSION = "1";

export type WorkerHeartbeat = {
  workerId: string;
  at: string;
  queues: string[];
  pid?: number;
  version?: string;
};

export type WorkerHealth = {
  alive: boolean;
  redisConfigured: boolean;
  lastSeenAt: string | null;
  workerId: string | null;
  queues: string[];
  pid: number | null;
  version: string | null;
  message: string;
};

/**
 * A worker is compatible when it is alive and speaks the same protocol. A worker
 * that reports no version at all predates version reporting; treat it as
 * compatible rather than taking the feature offline for an unknown.
 */
export function isWorkerVersionCompatible(
  health: WorkerHealth | null,
  expectedVersion: string = WORKER_PROTOCOL_VERSION,
) {
  if (health?.alive !== true) return false;
  return !health.version || health.version === expectedVersion;
}

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  queues?: string[];
  pid?: number;
  version?: string;
}) {
  const heartbeat: WorkerHeartbeat = {
    workerId: input.workerId,
    at: new Date().toISOString(),
    queues: input.queues ?? [getQueueNames().samplingRun, getQueueNames().semanticIntelligence],
    pid: input.pid,
    version: input.version,
  };

  const redis = await getWorkerHealthRedis();
  await redis.set(WORKER_HEARTBEAT_KEY, JSON.stringify(heartbeat), "EX", WORKER_HEARTBEAT_TTL_SECONDS);
  return heartbeat;
}

export async function clearWorkerHeartbeat() {
  if (!isRedisConfigured()) return;
  const redis = await getWorkerHealthRedis();
  await redis.del(WORKER_HEARTBEAT_KEY);
}

export async function getWorkerHealth(now = Date.now()): Promise<WorkerHealth> {
  if (!isRedisConfigured()) {
    return downHealth("REDIS_URL is not configured; no external worker is expected.", false);
  }

  try {
    const redis = await getWorkerHealthRedis();
    const raw = await redis.get(WORKER_HEARTBEAT_KEY);
    if (!raw) {
      return downHealth("No worker heartbeat has been seen in the last 30 seconds.", true);
    }

    return evaluateWorkerHeartbeat(JSON.parse(raw) as WorkerHeartbeat, now);
  } catch (error) {
    return downHealth(workerHealthErrorMessage(error), true);
  }
}

export function evaluateWorkerHeartbeat(heartbeat: WorkerHeartbeat | null, now = Date.now()): WorkerHealth {
  if (!heartbeat) {
    return downHealth("No worker heartbeat has been recorded.", true);
  }

  const seenAt = Date.parse(heartbeat.at);
  if (!Number.isFinite(seenAt)) {
    return {
      alive: false,
      redisConfigured: true,
      lastSeenAt: heartbeat.at,
      workerId: heartbeat.workerId || null,
      queues: heartbeat.queues ?? [],
      pid: heartbeat.pid ?? null,
      version: heartbeat.version ?? null,
      message: "Worker heartbeat timestamp is invalid.",
    };
  }

  const ageMs = Math.max(0, now - seenAt);
  const alive = ageMs <= WORKER_HEALTH_STALE_MS;

  return {
    alive,
    redisConfigured: true,
    lastSeenAt: heartbeat.at,
    workerId: heartbeat.workerId || null,
    queues: heartbeat.queues ?? [],
    pid: heartbeat.pid ?? null,
    version: heartbeat.version ?? null,
    message: alive ? "Worker heartbeat is fresh." : "Worker heartbeat is stale.",
  };
}

export async function closeWorkerHealthConnection() {
  await closeControlRedis();
}

function getWorkerHealthRedis() {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is not configured.");
  }
  return connectedControlRedis();
}

function downHealth(message: string, redisConfigured: boolean): WorkerHealth {
  return {
    alive: false,
    redisConfigured,
    lastSeenAt: null,
    workerId: null,
    queues: [],
    pid: null,
    version: null,
    message,
  };
}

function workerHealthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Worker health check failed.";
  }

  if (error.message === "Connection is closed." || error.message.includes("ECONNREFUSED")) {
    return "Redis is not reachable; worker heartbeat could not be read.";
  }

  return error.message;
}

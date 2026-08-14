import IORedis from "ioredis";

/**
 * Shared connection for short control-plane commands: rate limit counters,
 * provider budget counters, worker heartbeats, queue health probes.
 *
 * Deliberately separate from the BullMQ connection in `queue/client.ts`, which
 * BullMQ requires to have `maxRetriesPerRequest: null` and may hold in blocking
 * commands. Everything else that just needs a GET/SET/EVAL shares this one
 * rather than opening its own — there used to be four near-identical pools, and
 * `checkQueueHealth` opened and tore down a fifth on every single call.
 */
const CONTROL_REDIS_OPTIONS = {
  connectTimeout: 1500,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
} as const;

let controlRedis: IORedis | null = null;

export function isControlRedisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function getControlRedis() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is not configured.");
  }

  if (!controlRedis) {
    const connection = new IORedis(process.env.REDIS_URL, CONTROL_REDIS_OPTIONS);
    connection.on("error", (error) => {
      console.error("Control Redis connection error", error);
    });
    // A dead socket must not be cached, or every later caller inherits it.
    connection.on("end", () => {
      if (controlRedis === connection) controlRedis = null;
    });
    controlRedis = connection;
  }

  return controlRedis;
}

/** Connects the shared control connection if it is still lazy. */
export async function connectedControlRedis() {
  const redis = getControlRedis();
  if (redis.status === "wait") {
    try {
      await redis.connect();
    } catch (error) {
      redis.disconnect(false);
      if (controlRedis === redis) controlRedis = null;
      throw error;
    }
  }
  return redis;
}

export async function closeControlRedis() {
  if (!controlRedis) return;
  const connection = controlRedis;
  controlRedis = null;
  await connection.quit().catch(() => connection.disconnect(false));
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWorkerHeartbeat,
  isWorkerVersionCompatible,
  WORKER_HEALTH_STALE_MS,
  WORKER_PROTOCOL_VERSION,
} from "@/server/queue/worker-health";

test("worker health reports down when heartbeat is absent", () => {
  const health = evaluateWorkerHeartbeat(null);

  assert.equal(health.alive, false);
  assert.equal(health.lastSeenAt, null);
});

test("worker health reports alive for a fresh heartbeat", () => {
  const now = Date.now();
  const at = new Date(now - 5_000).toISOString();
  const health = evaluateWorkerHeartbeat({ workerId: "worker-1", at, queues: ["semantic.intelligence"], pid: 123 }, now);

  assert.equal(health.alive, true);
  assert.equal(health.workerId, "worker-1");
  assert.deepEqual(health.queues, ["semantic.intelligence"]);
});

test("worker health reports down for a stale heartbeat", () => {
  const now = Date.now();
  const at = new Date(now - WORKER_HEALTH_STALE_MS - 1).toISOString();
  const health = evaluateWorkerHeartbeat({ workerId: "worker-1", at, queues: [] }, now);

  assert.equal(health.alive, false);
  assert.equal(health.lastSeenAt, at);
});

function heartbeatAt(now: number, version?: string) {
  return evaluateWorkerHeartbeat({
    workerId: "worker-1",
    at: new Date(now).toISOString(),
    queues: ["semantic.intelligence"],
    version,
  }, now);
}

test("worker compatibility requires a live heartbeat speaking the expected protocol", () => {
  const now = Date.now();
  const health = heartbeatAt(now, "2");

  assert.equal(isWorkerVersionCompatible(health, "2"), true);
  assert.equal(isWorkerVersionCompatible(health, "3"), false);
});

test("a stale worker is incompatible no matter what protocol it claims", () => {
  const now = Date.now();
  const stale = evaluateWorkerHeartbeat({
    workerId: "worker-1",
    at: new Date(now - WORKER_HEALTH_STALE_MS - 1).toISOString(),
    queues: [],
    version: WORKER_PROTOCOL_VERSION,
  }, now);

  assert.equal(isWorkerVersionCompatible(stale), false);
  assert.equal(isWorkerVersionCompatible(null), false);
});

test("a live worker that reports no version is treated as compatible", () => {
  // Version reporting is newer than the heartbeat itself. Refusing an unknown
  // would take audits offline for a worker that is in fact running fine.
  assert.equal(isWorkerVersionCompatible(heartbeatAt(Date.now())), true);
});

test("the worker protocol version is independent of the semantic data version", async () => {
  // Regression: the heartbeat used to report `semanticNebulaVersion`, and the
  // start route demanded an exact match. Every tweak to the nebula output shape
  // therefore returned 503 for audits until every worker had been redeployed.
  const { semanticNebulaVersion } = await import("@/server/semantic-nebula/types");

  assert.notEqual(WORKER_PROTOCOL_VERSION, semanticNebulaVersion);
  assert.equal(isWorkerVersionCompatible(heartbeatAt(Date.now(), WORKER_PROTOCOL_VERSION)), true);
});

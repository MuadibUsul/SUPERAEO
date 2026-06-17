import assert from "node:assert/strict";
import test from "node:test";

import { evaluateWorkerHeartbeat, WORKER_HEALTH_STALE_MS } from "@/server/queue/worker-health";

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

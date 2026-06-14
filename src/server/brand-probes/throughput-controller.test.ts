import assert from "node:assert/strict";
import test from "node:test";

import { getProbeRunConfig } from "@/server/brand-probes/config";
import { computeBackpressure, ThroughputController } from "@/server/brand-probes/throughput-controller";

test("throughput controller maps 500 probes/minute to 100 requests/minute with batch size 5", () => {
  const config = getProbeRunConfig();
  const state = new ThroughputController(config).initialState(500);

  assert.equal(config.targetThroughputPerMinute, 500);
  assert.equal(config.executionMode, "micro_batch");
  assert.equal(config.microBatchSize, 5);
  assert.equal(state.targetRequestsPerMinute, 100);
  assert.equal(state.requestRateLimit, 120);
  assert.equal(state.concurrency, 24);
});

test("backpressure lowers concurrency and batch size under JSON failure pressure", () => {
  const config = getProbeRunConfig();
  const pressure = computeBackpressure({
    completedProbes: 50,
    failedProbes: 10,
    elapsedMs: 10000,
    averageLatencyMs: 8000,
    rateLimitErrors: 0,
    jsonFailures: 8,
    retryQueueSize: 1,
    tokensUsedInWindow: 200000,
  }, config);

  assert.equal(pressure.level, 3);
  assert.equal(pressure.batchSize, 1);
  assert.ok(pressure.concurrency <= config.maxConcurrency);
});

test("backpressure reacts to rate limit and token pressure before provider overload", () => {
  const config = getProbeRunConfig();
  const pressure = computeBackpressure({
    completedProbes: 200,
    failedProbes: 0,
    elapsedMs: 20000,
    averageLatencyMs: 5000,
    rateLimitErrors: 2,
    jsonFailures: 0,
    retryQueueSize: 0,
    tokensUsedInWindow: 590000,
  }, config);

  assert.equal(pressure.level, 2);
  assert.equal(pressure.batchSize, 3);
  assert.equal(pressure.requestRateLimit, 90);
});

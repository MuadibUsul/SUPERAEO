import assert from "node:assert/strict";
import test from "node:test";

import { getProbeRunConfig } from "@/server/brand-probes/config";
import { computeBackpressure, ThroughputController } from "@/server/brand-probes/throughput-controller";

test("throughput controller keeps the planned request rate and concurrency inside safe defaults", () => {
  const config = getProbeRunConfig();
  const state = new ThroughputController(config).initialState(500);

  assert.equal(config.targetThroughputPerMinute, 500);
  assert.equal(config.executionMode, "micro_batch");
  assert.equal(config.microBatchSize, 5);
  assert.equal(state.targetRequestsPerMinute, 100);
  assert.equal(state.requestRateLimit, 60);
  assert.equal(state.concurrency, 8);
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
    tokensUsedTotal: 200000,
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
    tokensUsedTotal: 590000,
  }, config);

  assert.equal(pressure.level, 2);
  assert.equal(pressure.batchSize, 3);
  assert.equal(pressure.requestRateLimit, 45);
});

test("token pressure follows the per-minute rate, not the cumulative total", () => {
  const config = getProbeRunConfig();
  // A long run whose cumulative tokens are many times the per-minute budget but
  // whose actual rate is well under it must not stay latched in token pressure.
  const relaxed = computeBackpressure({
    completedProbes: 3000,
    failedProbes: 0,
    elapsedMs: 30 * 60 * 1000,
    averageLatencyMs: 2000,
    rateLimitErrors: 0,
    jsonFailures: 0,
    retryQueueSize: 0,
    tokensUsedTotal: 5_000_000,
  }, config);
  assert.equal(relaxed.level, 0);
  assert.equal(relaxed.reason, null);

  // The same budget breached as an actual per-minute rate does apply pressure.
  const throttled = computeBackpressure({
    completedProbes: 300,
    failedProbes: 0,
    elapsedMs: 30 * 1000,
    averageLatencyMs: 2000,
    rateLimitErrors: 0,
    jsonFailures: 0,
    retryQueueSize: 0,
    tokensUsedTotal: 300_000,
  }, config);
  assert.equal(throttled.level, 2);
  assert.equal(throttled.reason, "token_budget_pressure");
});

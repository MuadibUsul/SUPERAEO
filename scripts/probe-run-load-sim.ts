import { getProbeRunConfig } from "@/server/brand-probes/config";
import { buildMicroBatches } from "@/server/brand-probes/micro-batch-builder";
import { computeBackpressure, ThroughputController } from "@/server/brand-probes/throughput-controller";

const probeCount = Number(process.argv[2] ?? 500);
const config = getProbeRunConfig();
const batches = buildMicroBatches(
  Array.from({ length: probeCount }, (_, index) => ({ id: `p${index + 1}`, payload: {} })),
  config.microBatchSize,
);
const controller = new ThroughputController(config);
const initial = controller.initialState(probeCount);
const simulatedElapsedMs = Math.ceil((batches.length / config.requestRateLimit) * 60000);
const actualThroughput = Math.round((probeCount / simulatedElapsedMs) * 60000);
const pressure = computeBackpressure({
  completedProbes: probeCount,
  failedProbes: 0,
  elapsedMs: simulatedElapsedMs,
  averageLatencyMs: 3500,
  rateLimitErrors: 0,
  jsonFailures: 0,
  retryQueueSize: 0,
  tokensUsedInWindow: Math.min(config.tokensPerMinuteBudget - 1, probeCount * 900),
}, config);

console.log(JSON.stringify({
  probeCount,
  targetThroughputPerMinute: config.targetThroughputPerMinute,
  microBatchSize: config.microBatchSize,
  requestRateLimit: config.requestRateLimit,
  maxConcurrency: config.maxConcurrency,
  tokensPerMinuteBudget: config.tokensPerMinuteBudget,
  batchCount: batches.length,
  targetRequestsPerMinute: initial.targetRequestsPerMinute,
  simulatedElapsedSeconds: Math.round(simulatedElapsedMs / 1000),
  simulatedActualThroughputPerMinute: actualThroughput,
  backpressureLevel: pressure.level,
  productionMode: config.executionMode,
}, null, 2));

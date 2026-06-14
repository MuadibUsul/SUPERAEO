import type { ProbeRunConfig } from "@/server/brand-probes/types";

export type ThroughputSample = {
  completedProbes: number;
  failedProbes: number;
  elapsedMs: number;
  averageLatencyMs: number;
  rateLimitErrors: number;
  jsonFailures: number;
  retryQueueSize: number;
  tokensUsedInWindow: number;
};

export type ThroughputState = {
  targetProbesPerMinute: number;
  targetRequestsPerMinute: number;
  actualProbesPerMinute: number;
  requestRateLimit: number;
  concurrency: number;
  batchSize: number;
  backpressureLevel: number;
  throttleReason: string | null;
  estimatedRemainingSeconds: number | null;
};

export class ThroughputController {
  private readonly config: ProbeRunConfig;

  constructor(config: ProbeRunConfig) {
    this.config = config;
  }

  initialState(totalProbes?: number): ThroughputState {
    const targetRequestsPerMinute = Math.ceil(this.config.targetThroughputPerMinute / this.config.microBatchSize);
    return {
      targetProbesPerMinute: this.config.targetThroughputPerMinute,
      targetRequestsPerMinute,
      actualProbesPerMinute: 0,
      requestRateLimit: this.config.requestRateLimit,
      concurrency: this.config.maxConcurrency,
      batchSize: this.config.microBatchSize,
      backpressureLevel: 0,
      throttleReason: null,
      estimatedRemainingSeconds: totalProbes ? Math.ceil((totalProbes / this.config.targetThroughputPerMinute) * 60) : null,
    };
  }

  update(sample: ThroughputSample, totalProbes: number): ThroughputState {
    const actualProbesPerMinute = sample.elapsedMs > 0 ? (sample.completedProbes / sample.elapsedMs) * 60000 : 0;
    const pressure = computeBackpressure(sample, this.config);
    const remaining = Math.max(0, totalProbes - sample.completedProbes - sample.failedProbes);
    const effectiveRate = Math.max(1, actualProbesPerMinute || this.config.targetThroughputPerMinute);
    return {
      targetProbesPerMinute: this.config.targetThroughputPerMinute,
      targetRequestsPerMinute: Math.ceil(this.config.targetThroughputPerMinute / this.config.microBatchSize),
      actualProbesPerMinute: Math.round(actualProbesPerMinute),
      requestRateLimit: pressure.requestRateLimit,
      concurrency: pressure.concurrency,
      batchSize: pressure.batchSize,
      backpressureLevel: pressure.level,
      throttleReason: pressure.reason,
      estimatedRemainingSeconds: Math.ceil((remaining / effectiveRate) * 60),
    };
  }
}

export function computeBackpressure(sample: ThroughputSample, config: ProbeRunConfig) {
  const jsonFailureRate = sample.jsonFailures / Math.max(1, sample.completedProbes + sample.failedProbes);
  const rateLimitPressure = sample.rateLimitErrors > 0;
  const latencyPressure = sample.averageLatencyMs > 12000;
  const jsonPressure = jsonFailureRate > 0.06;
  const retryPressure = sample.retryQueueSize > Math.max(5, config.maxConcurrency);
  const tokenPressure = sample.tokensUsedInWindow > config.tokensPerMinuteBudget * 0.9;

  if (jsonPressure) {
    return {
      level: 3,
      requestRateLimit: Math.max(60, Math.min(90, config.requestRateLimitMin)),
      concurrency: Math.max(1, config.maxConcurrencyMin),
      batchSize: 1,
      reason: jsonPressure ? "json_failure_pressure" : "token_and_rate_limit_pressure",
    };
  }
  if (tokenPressure || rateLimitPressure || retryPressure) {
    return {
      level: 2,
      requestRateLimit: 90,
      concurrency: Math.max(config.maxConcurrencyMin, 15),
      batchSize: Math.min(3, config.microBatchSize),
      reason: tokenPressure ? "token_budget_pressure" : rateLimitPressure ? "provider_rate_limit" : "retry_queue_pressure",
    };
  }
  if (latencyPressure) {
    return {
      level: 1,
      requestRateLimit: Math.max(config.requestRateLimitMin, 100),
      concurrency: Math.max(config.maxConcurrencyMin, Math.min(18, config.maxConcurrency)),
      batchSize: config.microBatchSize,
      reason: "latency_pressure",
    };
  }
  return {
    level: 0,
    requestRateLimit: config.requestRateLimit,
    concurrency: config.maxConcurrency,
    batchSize: config.microBatchSize,
    reason: null,
  };
}

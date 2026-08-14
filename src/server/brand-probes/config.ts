import type { ProbeExecutionMode, ProbeRunConfig, ProbeRunMode } from "@/server/brand-probes/types";

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function floatEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function modeEnv(name: string, fallback: ProbeRunMode): ProbeRunMode {
  const value = process.env[name];
  return value === "demo" || value === "standard" || value === "max500" || value === "max1000" ? value : fallback;
}

function executionModeEnv(name: string, fallback: ProbeExecutionMode): ProbeExecutionMode {
  const value = process.env[name];
  return value === "single" || value === "micro_batch" ? value : fallback;
}

export function getProbeRunConfig(overrides: Partial<ProbeRunConfig> = {}): ProbeRunConfig {
  const base: ProbeRunConfig = {
    mode: modeEnv("PROBE_DEFAULT_MODE", "standard"),
    executionMode: executionModeEnv("PROBE_DEFAULT_EXECUTION_MODE", "micro_batch"),
    targetThroughputPerMinute: intEnv("PROBE_TARGET_THROUGHPUT_PER_MINUTE", 500),
    microBatchSize: intEnv("PROBE_MICRO_BATCH_SIZE", 5),
    requestRateLimit: intEnv("PROBE_REQUESTS_PER_MINUTE", 120),
    requestRateLimitMin: intEnv("PROBE_REQUESTS_PER_MINUTE_MIN", 100),
    requestRateLimitMax: intEnv("PROBE_REQUESTS_PER_MINUTE_MAX", 140),
    maxConcurrency: intEnv("PROBE_MAX_CONCURRENCY", 24),
    maxConcurrencyMin: intEnv("PROBE_MAX_CONCURRENCY_MIN", 15),
    maxConcurrencyMax: intEnv("PROBE_MAX_CONCURRENCY_MAX", 30),
    tokensPerMinuteBudget: intEnv("PROBE_TOKENS_PER_MINUTE_BUDGET", 600000),
    tokensPerMinuteMin: intEnv("PROBE_TOKENS_PER_MINUTE_MIN", 400000),
    tokensPerMinuteMax: intEnv("PROBE_TOKENS_PER_MINUTE_MAX", 700000),
    maxRetries: intEnv("PROBE_MAX_RETRIES", 3),
    singleMaxOutputTokens: intEnv("PROBE_SINGLE_MAX_OUTPUT_TOKENS", 2000),
    batchMaxOutputTokens: intEnv("PROBE_BATCH_MAX_OUTPUT_TOKENS", 8000),
    defaultModel: process.env.PROBE_DEFAULT_MODEL || "deepseek-chat",
    modelTemperature: floatEnv("PROBE_TEMPERATURE", 0.3),
  };

  const merged = {
    ...base,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  } as ProbeRunConfig;
  return {
    ...merged,
    microBatchSize: Math.max(1, Math.min(10, merged.executionMode === "single" ? 1 : merged.microBatchSize)),
    requestRateLimit: Math.max(1, Math.min(merged.requestRateLimitMax, Math.max(merged.requestRateLimitMin, merged.requestRateLimit))),
    maxConcurrency: Math.max(1, Math.min(merged.maxConcurrencyMax, Math.max(merged.maxConcurrencyMin, merged.maxConcurrency))),
    tokensPerMinuteBudget: Math.max(merged.tokensPerMinuteMin, Math.min(merged.tokensPerMinuteMax, merged.tokensPerMinuteBudget)),
  };
}

export const zoneQuotas = {
  demo: {
    core_semantics: 20,
    implicit_recommendation: 25,
    competition: 25,
    scenario_fit: 20,
    audience_fit: 10,
    risk_boundary: 10,
    growth_opportunity: 5,
    calibration: 5,
  },
  standard: {
    core_semantics: 50,
    implicit_recommendation: 80,
    competition: 80,
    scenario_fit: 60,
    audience_fit: 30,
    risk_boundary: 30,
    growth_opportunity: 20,
    calibration: 10,
  },
  max500: {
    core_semantics: 70,
    implicit_recommendation: 100,
    competition: 100,
    scenario_fit: 70,
    audience_fit: 50,
    risk_boundary: 40,
    growth_opportunity: 30,
    calibration: 20,
  },
  // ~1000 probes balancing 重点 (priority) / 广度 (breadth) / 深度 (depth) so the
  // run paints a full panorama of the model's black box, not a deep re-sample of
  // a few questions. Priority zones (implicit recommendation, competition) keep
  // the largest share; breadth zones (scenario, audience) are widened; depth is
  // added per-question via depth levels in the generator.
  max1000: {
    core_semantics: 110,
    implicit_recommendation: 200,
    competition: 200,
    scenario_fit: 170,
    audience_fit: 120,
    risk_boundary: 80,
    growth_opportunity: 80,
    calibration: 40,
  },
} as const;

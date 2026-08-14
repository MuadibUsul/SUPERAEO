export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.2);
}

export function estimateBatchTokens(prompts: string[], maxOutputTokens: number) {
  return prompts.reduce((total, prompt) => total + estimateTokens(prompt), 0) + maxOutputTokens;
}

export function usageNumbers(usage: unknown, model?: string) {
  const record = usage && typeof usage === "object" && !Array.isArray(usage) ? usage as Record<string, unknown> : {};
  const promptTokens = numberOrUndefined(record.promptTokens ?? record.prompt_tokens ?? record.input_tokens);
  const completionTokens = numberOrUndefined(record.completionTokens ?? record.completion_tokens ?? record.output_tokens);
  const totalTokens = numberOrUndefined(record.totalTokens ?? record.total_tokens);
  const deepSeek = model?.toLowerCase().startsWith("deepseek") === true;
  const inputCostPerMillion = nonNegativeEnv("SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION", deepSeek ? 0.14 : 5);
  const outputCostPerMillion = nonNegativeEnv("SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION", deepSeek ? 0.28 : 20);
  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens ?? (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined),
    cachedInputTokens: numberOrUndefined(record.cachedInputTokens ?? record.cached_input_tokens),
    reasoningTokens: numberOrUndefined(record.reasoningTokens ?? record.reasoning_tokens),
    estimatedCostUsd: ((promptTokens ?? 0) * inputCostPerMillion + (completionTokens ?? 0) * outputCostPerMillion) / 1_000_000,
  };
}

export function allocateUsageAcrossProbes(usage: ReturnType<typeof usageNumbers>, probeCount: number) {
  const divisor = Math.max(1, probeCount);
  const divide = (value: number | undefined) => value === undefined ? undefined : Math.ceil(value / divisor);
  return {
    promptTokens: divide(usage.promptTokens),
    completionTokens: divide(usage.completionTokens),
    totalTokens: divide(usage.totalTokens),
    cachedInputTokens: divide(usage.cachedInputTokens),
    reasoningTokens: divide(usage.reasoningTokens),
    estimatedCostUsd: usage.estimatedCostUsd / divisor,
  };
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function nonNegativeEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

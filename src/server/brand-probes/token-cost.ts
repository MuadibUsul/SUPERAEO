export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.2);
}

export function estimateBatchTokens(prompts: string[], maxOutputTokens: number) {
  return prompts.reduce((total, prompt) => total + estimateTokens(prompt), 0) + maxOutputTokens;
}

export function usageNumbers(usage: unknown) {
  const record = usage && typeof usage === "object" && !Array.isArray(usage) ? usage as Record<string, unknown> : {};
  const promptTokens = numberOrUndefined(record.promptTokens ?? record.prompt_tokens ?? record.input_tokens);
  const completionTokens = numberOrUndefined(record.completionTokens ?? record.completion_tokens ?? record.output_tokens);
  const totalTokens = numberOrUndefined(record.totalTokens ?? record.total_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: totalTokens ?? (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined),
    cachedInputTokens: numberOrUndefined(record.cachedInputTokens ?? record.cached_input_tokens),
    reasoningTokens: numberOrUndefined(record.reasoningTokens ?? record.reasoning_tokens),
  };
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

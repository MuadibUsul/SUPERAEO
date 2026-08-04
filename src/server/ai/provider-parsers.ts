/**
 * Pure parsers for provider HTTP responses.
 *
 * Every provider returns a different JSON shape and each one drifts over time
 * (OpenAI Responses vs. chat-completions, Anthropic messages, Gemini native).
 * Keeping the extraction here — pure, deterministic, defensive against missing
 * fields — means a provider format change is caught by a unit test instead of
 * silently producing empty answers in production.
 */
import { asArray, asRecord } from "@/server/utils/coerce";

export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

/** OpenAI Responses API: prefers `output_text`, falls back to output[0].content[0].text. */
export function openAIResponseText(raw: unknown): string {
  const body = asRecord(raw);
  const output = asArray(body.output);
  const firstOutput = asRecord(output[0]);
  const content = asArray(firstOutput.content);
  const firstContent = asRecord(content[0]);
  return String(body.output_text ?? firstContent.text ?? "");
}

/** OpenAI-compatible chat-completions: choices[0].message.content. */
export function chatCompletionText(raw: unknown): string {
  const choices = asArray(asRecord(raw).choices);
  const firstChoice = asRecord(choices[0]);
  return String(asRecord(firstChoice.message).content ?? "");
}

/** Anthropic Messages: joins the text of every content block. */
export function anthropicText(raw: unknown): string {
  return asArray(asRecord(raw).content)
    .map((part) => asRecord(part).text)
    .filter(Boolean)
    .join("\n");
}

/** Gemini native: candidates[0].content.parts[0].text. */
export function geminiText(raw: unknown): string {
  const candidates = asArray(asRecord(raw).candidates);
  const candidate = asRecord(candidates[0]);
  const parts = asArray(asRecord(candidate.content).parts);
  return String(asRecord(parts[0]).text ?? "");
}

/** OpenAI-style usage, tolerant of both Responses (`input_tokens`) and chat (`prompt_tokens`). */
export function usageFromOpenAI(raw: unknown): ProviderUsage | undefined {
  const usage = asRecord(asRecord(raw).usage);
  return {
    promptTokens: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || undefined,
    completionTokens: Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || undefined,
    totalTokens: Number(usage.total_tokens ?? 0) || undefined,
  };
}

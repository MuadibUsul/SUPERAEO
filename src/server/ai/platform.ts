export function platformFromProviderType(
  providerType: string,
): "perplexity" | "anthropic" | "gemini" | "openai_compatible" | "openai" {
  if (providerType === "perplexity_sonar") return "perplexity";
  if (providerType === "anthropic_messages") return "anthropic";
  if (providerType === "gemini_native") return "gemini";
  if (providerType === "openai_compatible") return "openai_compatible";
  return "openai";
}

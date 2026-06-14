import { getDefaultEnabledProvider } from "@/server/ai/provider-config";
import { isRedisConfigured } from "@/server/queue/client";

export async function getAIReadiness() {
  const provider = await getDefaultEnabledProvider();

  if (!provider) {
    return {
      ready: false,
      code: "missing_provider",
      provider: null,
      queueReady: isRedisConfigured(),
      reason:
        "No enabled AI provider is configured. Ask an operator to enable a provider and add a backend API key.",
    } as const;
  }

  if (!provider.apiKeyEncrypted) {
    return {
      ready: false,
      code: "missing_api_key",
      provider,
      queueReady: isRedisConfigured(),
      reason:
        "The enabled AI provider is missing its API key. Add the encrypted provider key in the operator console first.",
    } as const;
  }

  return {
    ready: true,
    code: "ready",
    provider,
    queueReady: isRedisConfigured(),
    reason: null,
  } as const;
}

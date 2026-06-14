import type { AIProvider, AIProviderType } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { maskSecret } from "@/server/security/encryption";
import type { AIProviderSafe } from "@/server/ai/types";

export function sanitizeProvider(provider: AIProvider): AIProviderSafe {
  const { apiKeyEncrypted, ...safe } = provider;
  return {
    ...safe,
    apiKeyStatus: maskSecret(apiKeyEncrypted),
  };
}

export async function getDefaultEnabledProvider() {
  return getPrisma().aIProvider.findFirst({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
  });
}

export function normalizeProviderBaseUrl(baseUrl?: string | null) {
  if (!baseUrl || !baseUrl.trim()) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error("Base URL must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Base URL must start with http:// or https://.");
  }

  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  return parsed.toString().replace(/\/$/, "");
}

export function validateProviderCompatibility(input: {
  providerType: AIProviderType;
  baseUrl?: string | null;
}) {
  const normalizedBaseUrl = normalizeProviderBaseUrl(input.baseUrl);
  const host = normalizedBaseUrl ? new URL(normalizedBaseUrl).hostname.toLowerCase() : "";

  if (host === "api.deepseek.com" && input.providerType !== "openai_compatible") {
    throw new Error(
      "DeepSeek should be configured as openai_compatible. Its official API uses the OpenAI-compatible chat completions format rather than the Responses API.",
    );
  }

  return {
    normalizedBaseUrl,
    host,
  };
}

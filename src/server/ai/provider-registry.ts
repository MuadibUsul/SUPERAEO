import type { AIProvider } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { decryptSecret } from "@/server/security/encryption";
import type { AIJsonInput, AITextInput, AITextResult, ProviderRuntime } from "@/server/ai/types";
import { getDefaultEnabledProvider, validateProviderCompatibility } from "@/server/ai/provider-config";
import { asArray, asRecord } from "@/server/utils/coerce";
import {
  anthropicText,
  chatCompletionText,
  geminiText,
  openAIResponseText,
  usageFromOpenAI,
} from "@/server/ai/provider-parsers";

type ProviderContext = {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
};

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function postJson(url: string, apiKey: string, body: unknown, headers?: HeadersInit) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    const body = asRecord(json);
    const error = asRecord(body.error);
    throw new Error(
      String(error.message ?? body.message ?? `Provider request failed with ${response.status}`),
    );
  }

  return json;
}

function createRuntime(context: ProviderContext): ProviderRuntime {
  const { provider, apiKey } = context;
  const baseUrl = trimSlash(context.baseUrl);

  async function generateText(input: AITextInput): Promise<AITextResult> {
    if (provider.providerType === "openai_responses") {
      const raw = await postJson(`${baseUrl}/responses`, apiKey, {
        model: input.model ?? provider.defaultModel,
        input: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
        max_output_tokens: input.maxOutputTokens,
        temperature: input.temperature,
      });
      return {
        text: openAIResponseText(raw),
        raw,
        usage: usageFromOpenAI(raw),
      };
    }

    if (
      provider.providerType === "openai_compatible" ||
      provider.providerType === "perplexity_sonar"
    ) {
      const raw = await postJson(`${baseUrl}/chat/completions`, apiKey, {
        model: input.model ?? provider.defaultModel,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
        max_tokens: input.maxOutputTokens,
        temperature: input.temperature,
      });
      return {
        text: chatCompletionText(raw),
        raw,
        usage: usageFromOpenAI(raw),
      };
    }

    if (provider.providerType === "anthropic_messages") {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: input.model ?? provider.defaultModel,
          max_tokens: input.maxOutputTokens ?? 1024,
          temperature: input.temperature,
          system: input.system,
          messages: [{ role: "user", content: input.prompt }],
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(asRecord(asRecord(raw).error).message ?? `Provider request failed with ${response.status}`));
      }
      const anthropicUsage = asRecord(asRecord(raw).usage);
      const inputTokens = Number(anthropicUsage.input_tokens ?? 0) || undefined;
      const outputTokens = Number(anthropicUsage.output_tokens ?? 0) || undefined;
      return {
        text: anthropicText(raw),
        raw,
        usage: Object.keys(anthropicUsage).length
          ? {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens:
                inputTokens !== undefined && outputTokens !== undefined
                  ? inputTokens + outputTokens
                  : undefined,
            }
          : undefined,
      };
    }

    if (provider.providerType === "gemini_native") {
      const raw = await postJson(
        `${baseUrl}/v1beta/models/${input.model ?? provider.defaultModel}:generateContent?key=${apiKey}`,
        "",
        {
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          systemInstruction: input.system
            ? { parts: [{ text: input.system }] }
            : undefined,
          generationConfig: {
            maxOutputTokens: input.maxOutputTokens,
            temperature: input.temperature,
          },
        },
        { Authorization: "" },
      );
      return {
        text: geminiText(raw),
        raw,
        usage: Object.keys(asRecord(asRecord(raw).usageMetadata)).length
          ? {
              promptTokens: Number(asRecord(asRecord(raw).usageMetadata).promptTokenCount ?? 0) || undefined,
              completionTokens: Number(asRecord(asRecord(raw).usageMetadata).candidatesTokenCount ?? 0) || undefined,
              totalTokens: Number(asRecord(asRecord(raw).usageMetadata).totalTokenCount ?? 0) || undefined,
            }
          : undefined,
      };
    }

    throw new Error(`Unsupported provider type: ${provider.providerType}`);
  }

  async function generateJson(input: AIJsonInput): Promise<AITextResult> {
    if (provider.providerType === "openai_responses") {
      const raw = await postJson(`${baseUrl}/responses`, apiKey, {
        model: input.model ?? provider.defaultModel,
        input: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
        max_output_tokens: input.maxOutputTokens,
        temperature: input.temperature,
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            schema: input.jsonSchema,
            strict: true,
          },
        },
      });
      return {
        text: openAIResponseText(raw),
        raw,
        usage: usageFromOpenAI(raw),
      };
    }

    if (
      provider.providerType === "openai_compatible" ||
      provider.providerType === "perplexity_sonar"
    ) {
      const raw = await postJson(`${baseUrl}/chat/completions`, apiKey, {
        model: input.model ?? provider.defaultModel,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
        max_tokens: input.maxOutputTokens,
        temperature: input.temperature,
        response_format: {
          type: "json_object",
        },
      });
      return {
        text: chatCompletionText(raw),
        raw,
        usage: usageFromOpenAI(raw),
      };
    }

    return generateText({
      ...input,
      prompt: `${input.prompt}\n\nReturn strict JSON only. Schema name: ${input.schemaName}.`,
    });
  }

  async function testConnection() {
    const started = Date.now();
    try {
      await generateText({
        prompt: "Reply with OK.",
        operation: "provider_test",
        model: provider.defaultModel,
      });
      return {
        ok: true,
        message: "Provider connection succeeded.",
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Provider connection failed.",
        latencyMs: Date.now() - started,
      };
    }
  }

  return {
    type: provider.providerType,
    generateText,
    generateJson,
    testConnection,
  };
}

export async function getProviderRuntime(providerId?: string) {
  const { runtime } = await getProviderRuntimeContext(providerId);
  return runtime;
}

export async function getProviderRuntimeContext(providerId?: string) {
  const prisma = getPrisma();
  const provider = providerId
    ? await prisma.aIProvider.findUnique({ where: { id: providerId } })
    : await getDefaultEnabledProvider();

  if (!provider) {
    throw new Error("No enabled AI provider is configured.");
  }

  if (providerId && !provider.enabled) {
    throw new Error("Selected AI provider is disabled. Enable it before running a connection test.");
  }

  if (!provider.enabled) {
    throw new Error("No enabled AI provider is configured.");
  }

  if (!provider.apiKeyEncrypted) {
    throw new Error("Selected AI provider does not have an API key configured.");
  }

  const defaultBaseUrl = {
    openai_responses: "https://api.openai.com/v1",
    openai_compatible: "https://api.openai.com/v1",
    anthropic_messages: "https://api.anthropic.com",
    gemini_native: "https://generativelanguage.googleapis.com",
    perplexity_sonar: "https://api.perplexity.ai",
  }[provider.providerType];

  const { normalizedBaseUrl } = validateProviderCompatibility({
    providerType: provider.providerType,
    baseUrl: provider.baseUrl || defaultBaseUrl,
  });

  return {
    provider,
    runtime: createRuntime({
      provider,
      apiKey: decryptSecret(provider.apiKeyEncrypted),
      baseUrl: normalizedBaseUrl || defaultBaseUrl,
    }),
  };
}

export async function logAIUsage(input: {
  providerId?: string;
  modelId?: string;
  projectId?: string;
  organizationId?: string;
  userId?: string;
  operation: string;
  status: "success" | "failed";
  usage?: AITextResult["usage"];
  latencyMs?: number;
  error?: string;
  metadata?: unknown;
}) {
  return getPrisma().aIUsageLog.create({
    data: {
      providerId: input.providerId,
      modelId: input.modelId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      userId: input.userId,
      operation: input.operation,
      status: input.status,
      promptTokens: input.usage?.promptTokens,
      completionTokens: input.usage?.completionTokens,
      totalTokens: input.usage?.totalTokens,
      latencyMs: input.latencyMs,
      error: input.error,
      metadata:
        input.metadata === undefined
          ? undefined
          : (input.metadata as Prisma.InputJsonValue),
    },
    select: { id: true },
  });
}

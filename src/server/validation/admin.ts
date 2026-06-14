import { z } from "zod";

export const providerTypes = [
  "openai_responses",
  "openai_compatible",
  "anthropic_messages",
  "gemini_native",
  "perplexity_sonar",
] as const;

const httpUrlSchema = z.string().trim().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}, "Base URL must be a valid http:// or https:// URL.");

export const createAIProviderSchema = z.object({
  name: z.string().trim().min(2),
  providerType: z.enum(providerTypes),
  baseUrl: httpUrlSchema.optional().or(z.literal("")),
  apiKey: z.string().trim().optional().or(z.literal("")),
  defaultModel: z.string().trim().min(1),
  enabled: z.boolean().default(false),
  supportsJsonSchema: z.boolean().default(false),
  supportsCitations: z.boolean().default(false),
  supportsWebSearch: z.boolean().default(false),
  supportsEmbeddings: z.boolean().default(false),
  rateLimitPerMinute: z.coerce.number().int().positive().optional().nullable(),
  monthlyBudget: z.coerce.number().positive().optional().nullable(),
});

export const updateAIProviderSchema = createAIProviderSchema.partial();

export const createAIModelSchema = z.object({
  providerId: z.string().min(1),
  name: z.string().trim().min(1),
  displayName: z.string().trim().optional().or(z.literal("")),
  enabled: z.boolean().default(true),
  supportsJsonSchema: z.boolean().default(false),
  supportsCitations: z.boolean().default(false),
  supportsWebSearch: z.boolean().default(false),
  supportsEmbeddings: z.boolean().default(false),
  defaultForTasks: z.array(z.string()).default([]),
});

export const createPromptTemplateSchema = z.object({
  name: z.string().trim().min(1),
  task: z.string().trim().min(1),
  version: z.string().trim().min(1),
  locale: z.enum(["zh-CN", "en"]).default("en"),
  content: z.string().trim().min(10),
  outputSchema: z.unknown().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

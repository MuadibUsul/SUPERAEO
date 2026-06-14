import type { AIProvider, AIProviderType } from "@/generated/prisma/client";

export type AIProviderSafe = Omit<AIProvider, "apiKeyEncrypted"> & {
  apiKeyStatus: "configured" | "not_configured";
};

export type AITextInput = {
  providerId?: string;
  model?: string;
  system?: string;
  prompt: string;
  operation: string;
  projectId?: string;
  organizationId?: string;
  userId?: string;
  maxOutputTokens?: number;
  temperature?: number;
};

export type AIJsonInput<TSchema = unknown> = AITextInput & {
  schemaName: string;
  jsonSchema: TSchema;
};

export type AITextResult = {
  text: string;
  raw: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type ProviderRuntime = {
  type: AIProviderType;
  generateText(input: AITextInput): Promise<AITextResult>;
  generateJson(input: AIJsonInput): Promise<AITextResult>;
  testConnection(): Promise<{ ok: boolean; message: string; latencyMs?: number }>;
};

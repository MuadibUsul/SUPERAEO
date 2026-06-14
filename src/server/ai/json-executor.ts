import type { z } from "zod";

import { getProviderRuntimeContext, logAIUsage } from "@/server/ai/provider-registry";
import { getPrisma } from "@/server/db";
import { recordTraceEvent } from "@/server/observability/event-log";
import { getTraceContext } from "@/server/observability/trace-context";

function parseStrictJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

export async function runJsonPrompt<T>({
  projectId,
  subjectId,
  userId,
  organizationId,
  providerId: requestedProviderId,
  model,
  promptName,
  promptVersion,
  system,
  prompt,
  schema,
  schemaName,
  metadata,
  jsonSchema,
  maxOutputTokens,
  temperature,
}: {
  projectId?: string;
  subjectId?: string;
  userId?: string;
  organizationId?: string;
  providerId?: string;
  model?: string;
  promptName: string;
  promptVersion: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  metadata?: Record<string, unknown>;
  jsonSchema?: unknown;
  maxOutputTokens?: number;
  temperature?: number;
}) {
  const prisma = getPrisma();
  let providerId: string | undefined;
  let providerModel: string | undefined;
  let runtime: Awaited<ReturnType<typeof getProviderRuntimeContext>>["runtime"] | null = null;
  const started = Date.now();
  let rawOutput: string | undefined;
  let repairAttempted = false;
  let usage: unknown;
  const traceContext = getTraceContext();
  const promptMetadata = {
    ...metadata,
    traceId: traceContext?.traceId,
  };

  try {
    await recordTraceEvent({
      severity: "info",
      eventType: "ai.prompt.started",
      subsystem: "ai",
      operation: promptName,
      status: "started",
      projectId,
      objectType: "PromptRun",
      metadata: { promptVersion, schemaName, requestedProviderId, model, maxOutputTokens, temperature },
    });
    const context = await getProviderRuntimeContext(requestedProviderId);
    providerId = context.provider.id;
    providerModel = model ?? context.provider.defaultModel;
    runtime = context.runtime;

    const result = await runtime.generateJson({
      system,
      prompt,
      model: providerModel,
      schemaName,
      jsonSchema: jsonSchema ?? { type: "object" },
      operation: promptName,
      maxOutputTokens,
      temperature,
    });
    rawOutput = result.text;
    usage = result.usage;

    let parsed = schema.safeParse(parseStrictJson(rawOutput));

    if (!parsed.success) {
      repairAttempted = true;
      const repair = await runtime.generateJson({
        system:
          "Repair invalid JSON so it matches the requested schema. Return strict JSON only. Do not add commentary.",
        prompt: [
          "Original task:",
          prompt,
          "",
          "Invalid output:",
          rawOutput,
          "",
          "Validation error:",
          parsed.error.message,
        ].join("\n"),
        model: providerModel,
        schemaName,
        jsonSchema: jsonSchema ?? { type: "object" },
        operation: `${promptName}_repair`,
        maxOutputTokens,
        temperature,
      });
      rawOutput = repair.text;
      usage = repair.usage ?? usage;
      parsed = schema.safeParse(parseStrictJson(rawOutput));
    }

    if (!parsed.success) {
      const promptRun = await prisma.promptRun.create({
        data: {
          projectId,
          subjectId,
          providerId,
          promptName,
          promptVersion,
          model: providerModel ?? "unconfigured",
          input: { system, prompt } as never,
          rawOutput,
          status: "failed",
          error: parsed.error.message,
          repairAttempted,
          usage: usage as never,
          metadata: promptMetadata as never,
        },
      });

      const usageLog = await logAIUsage({
        providerId,
        projectId,
        organizationId,
        userId,
        operation: promptName,
        status: "failed",
        usage: usage as never,
        latencyMs: Date.now() - started,
        error: parsed.error.message,
        metadata: promptMetadata,
      });
      await recordTraceEvent({
        severity: "error",
        eventType: "ai.prompt.failed",
        subsystem: "ai",
        operation: promptName,
        status: "failed",
        errorCode: "STRUCTURED_OUTPUT_ERROR",
        errorMessage: parsed.error.message,
        durationMs: Date.now() - started,
        projectId,
        promptRunId: promptRun.id,
        aiUsageLogId: usageLog.id,
        objectType: "PromptRun",
        objectId: promptRun.id,
        metadata: { promptVersion, schemaName, providerId, model: providerModel, repairAttempted },
      });

      return {
        ok: false as const,
        promptRunId: promptRun.id,
        error: parsed.error.message,
        providerId,
        model: providerModel,
        rawOutput,
        usage,
        repairAttempted,
      };
    }

    const promptRun = await prisma.promptRun.create({
      data: {
        projectId,
        subjectId,
        providerId,
        promptName,
        promptVersion,
        model: providerModel ?? "unconfigured",
        input: { system, prompt } as never,
        rawOutput,
        parsedOutput: parsed.data as never,
        status: repairAttempted ? "repaired" : "success",
        repairAttempted,
        usage: usage as never,
        metadata: promptMetadata as never,
      },
    });

    const usageLog = await logAIUsage({
      providerId,
      projectId,
      organizationId,
      userId,
      operation: promptName,
      status: "success",
      usage: usage as never,
      latencyMs: Date.now() - started,
      metadata: promptMetadata,
    });
    await recordTraceEvent({
      severity: "info",
      eventType: repairAttempted ? "ai.prompt.repaired" : "ai.prompt.succeeded",
      subsystem: "ai",
      operation: promptName,
      status: repairAttempted ? "repaired" : "succeeded",
      durationMs: Date.now() - started,
      projectId,
      promptRunId: promptRun.id,
      aiUsageLogId: usageLog.id,
      objectType: "PromptRun",
      objectId: promptRun.id,
      metadata: { promptVersion, schemaName, providerId, model: providerModel, repairAttempted, usage },
    });

    return {
      ok: true as const,
      data: parsed.data,
      promptRunId: promptRun.id,
      providerId,
      model: providerModel,
      rawOutput,
      usage,
      repairAttempted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI JSON generation failed.";
    const promptRun = await prisma.promptRun.create({
      data: {
        projectId,
        subjectId,
        providerId,
        promptName,
        promptVersion,
        model: providerModel ?? "unconfigured",
        input: { system, prompt } as never,
        rawOutput,
        status: "failed",
        error: message,
        repairAttempted,
        usage: usage as never,
        metadata: promptMetadata as never,
      },
    });

    const usageLog = await logAIUsage({
      providerId,
      projectId,
      organizationId,
      userId,
      operation: promptName,
      status: "failed",
      usage: usage as never,
      latencyMs: Date.now() - started,
      error: message,
      metadata: promptMetadata,
    });
    await recordTraceEvent({
      severity: "error",
      eventType: "ai.prompt.failed",
      subsystem: "ai",
      operation: promptName,
      status: "failed",
      error,
      durationMs: Date.now() - started,
      projectId,
      promptRunId: promptRun.id,
      aiUsageLogId: usageLog.id,
      objectType: "PromptRun",
      objectId: promptRun.id,
      metadata: { promptVersion, schemaName, providerId, model: providerModel, repairAttempted },
    });

    return {
      ok: false as const,
      promptRunId: promptRun.id,
      error: message,
      providerId,
      model: providerModel,
      rawOutput,
      usage,
      repairAttempted,
    };
  }
}

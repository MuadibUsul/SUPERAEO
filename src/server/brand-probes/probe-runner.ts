import type { BrandProbe, BrandProbeBatch, BrandProbeRun, Prisma } from "@/generated/prisma/client";
import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { runJsonPrompt } from "@/server/ai/json-executor";
import { getProbeRunConfig } from "@/server/brand-probes/config";
import { buildMicroBatches } from "@/server/brand-probes/micro-batch-builder";
import { RateLimiter } from "@/server/brand-probes/rate-limiter";
import { extractSignals } from "@/server/brand-probes/signal-extractor";
import { advanceSemanticExploration, getSemanticExplorationConfig } from "@/server/brand-probes/semantic-exploration-service";
import { estimateBatchTokens, usageNumbers } from "@/server/brand-probes/token-cost";
import { ThroughputController, type ThroughputSample } from "@/server/brand-probes/throughput-controller";
import { legacyProbeBatchResponseJsonSchema, legacyProbeResponseJsonSchema, probeBatchResponseJsonSchema, probeBatchResponseSchema, probeResponseJsonSchema, probeResponseSchema, type ProbeResponseJson } from "@/server/brand-probes/types";
import { getPrisma } from "@/server/db";
import { recordTraceEvent } from "@/server/observability/event-log";

type ProbeWithRun = BrandProbe & {
  run: { id: string; projectId: string; subjectId: string | null };
};

export async function runBrandProbeRun(input: { runId: string; analysisJobId?: string | null }): Promise<BrandProbeRun> {
  const prisma = getPrisma();
  const run = await prisma.brandProbeRun.findUnique({
    where: { id: input.runId },
    include: { project: true, subject: true },
  });
  if (!run) throw new Error("Brand probe run not found.");
  const runRecord = run;
  const semanticExplorationEnabled =
    asRecord(asRecord(runRecord.configJson).semanticExploration).enabled === true ||
    getSemanticExplorationConfig().enabled;

  const config = getProbeRunConfig({
    mode: runRecord.mode,
    executionMode: runRecord.executionMode,
    targetThroughputPerMinute: runRecord.targetThroughputPerMinute,
    microBatchSize: runRecord.microBatchSize,
    requestRateLimit: runRecord.requestRateLimit,
    maxConcurrency: runRecord.maxConcurrency,
    tokensPerMinuteBudget: runRecord.tokensPerMinuteBudget,
  });
  const controller = new ThroughputController(config);
  const startedAt = Date.now();
  const sample: ThroughputSample = {
    completedProbes: runRecord.completedProbes,
    failedProbes: runRecord.failedProbes,
    elapsedMs: 0,
    averageLatencyMs: 0,
    rateLimitErrors: 0,
    jsonFailures: 0,
    retryQueueSize: 0,
    tokensUsedInWindow: 0,
  };
  const limiter = new RateLimiter({
    requestsPerMinute: config.requestRateLimit,
    probesPerMinute: config.targetThroughputPerMinute,
    tokensPerMinute: config.tokensPerMinuteBudget,
    maxConcurrency: config.maxConcurrency,
  });

  await prisma.brandProbeRun.update({
    where: { id: runRecord.id },
    data: {
      status: "running",
      startedAt: runRecord.startedAt ?? new Date(),
      currentStage: "PROBE_RUNNING",
      analysisJobId: input.analysisJobId ?? runRecord.analysisJobId,
    },
  });
  await recordTraceEvent({
    severity: "info",
    eventType: "brand_probe.run.started",
    subsystem: "brand_probe",
    operation: "brand_probe_run",
    status: "running",
    projectId: runRecord.projectId,
    analysisJobId: input.analysisJobId ?? runRecord.analysisJobId ?? undefined,
    objectType: "BrandProbeRun",
    objectId: runRecord.id,
    metadata: {
      mode: runRecord.mode,
      executionMode: runRecord.executionMode,
      targetThroughputPerMinute: runRecord.targetThroughputPerMinute,
      microBatchSize: runRecord.microBatchSize,
    },
  });

  const probes = await prisma.brandProbe.findMany({
    where: { runId: runRecord.id, status: { in: ["pending", "failed", "retrying"] } },
    orderBy: [{ zone: "asc" }, { createdAt: "asc" }],
  });
  await prisma.brandProbe.updateMany({ where: { runId: runRecord.id, id: { in: probes.map((probe) => probe.id) } }, data: { status: "queued" } });

  const plan = await resolveTaskExecutionPlan({ task: "brand_semantic_probe_sampling", workUnits: probes.length });
  const batches = await createBatches(runRecord.id, runRecord.projectId, probes, config.executionMode === "single" ? 1 : config.microBatchSize);
  let cursor = 0;
  const latencies: number[] = [];

  async function worker(workerIndex: number) {
    for (;;) {
      const batch = batches[cursor++];
      if (!batch) return;
      const batchProbes = probes.filter((probe) => batch.probeIds.includes(probe.id));
      const estimatedTokens = estimateBatchTokens(batchProbes.map((probe) => probe.prompt), batchProbes.length === 1 ? config.singleMaxOutputTokens : config.batchMaxOutputTokens);
      await limiter.schedule({
        probes: batchProbes.length,
        estimatedTokens,
        task: async () => {
          const lane = plan.lanes[workerIndex % plan.lanes.length];
          const before = Date.now();
          const result = await executeBatch({
            batch,
            probes: batchProbes.map((probe) => ({ ...probe, run: { id: runRecord.id, projectId: runRecord.projectId, subjectId: runRecord.subjectId } })),
            providerId: lane.providerId,
            model: lane.model,
            maxRetries: config.maxRetries,
            maxOutputTokens: batchProbes.length === 1 ? config.singleMaxOutputTokens : config.batchMaxOutputTokens,
            temperature: config.modelTemperature,
            brandAliases: [runRecord.subject?.displayName || runRecord.project.brandName, runRecord.subject?.canonicalName || runRecord.project.brandName],
            semanticExplorationEnabled,
          });
          const latency = Date.now() - before;
          latencies.push(latency);
          sample.completedProbes += result.completed;
          sample.failedProbes += result.failed;
          sample.rateLimitErrors += result.rateLimitErrors;
          sample.jsonFailures += result.jsonFailures;
          sample.tokensUsedInWindow += result.tokens;
          sample.elapsedMs = Date.now() - startedAt;
          sample.averageLatencyMs = Math.round(latencies.reduce((total, item) => total + item, 0) / Math.max(1, latencies.length));
          const state = controller.update(sample, runRecord.totalProbes);
          limiter.update({
            requestsPerMinute: state.requestRateLimit,
            maxConcurrency: state.concurrency,
            probesPerMinute: config.targetThroughputPerMinute,
            tokensPerMinute: config.tokensPerMinuteBudget,
          });
          await prisma.brandProbeRun.update({
            where: { id: runRecord.id },
            data: {
              completedProbes: sample.completedProbes,
              failedProbes: sample.failedProbes,
              actualThroughputPerMinute: state.actualProbesPerMinute,
              currentRequestRateLimit: state.requestRateLimit,
              currentConcurrency: state.concurrency,
              currentBatchSize: state.batchSize,
              backpressureLevel: state.backpressureLevel,
              throttleReason: state.throttleReason,
              schedulerStatsJson: state as unknown as Prisma.InputJsonValue,
            },
          });
        },
      });
    }
  }

  await Promise.all(Array.from({ length: config.maxConcurrency }, (_, index) => worker(index)));

  const exploration = await advanceSemanticExploration({ runId: runRecord.id, analysisJobId: input.analysisJobId, enabled: semanticExplorationEnabled });
  if (exploration.enabled && exploration.continue) {
    return runBrandProbeRun(input);
  }

  const latest = await prisma.brandProbeRun.findUnique({ where: { id: runRecord.id } });
  const status = latest && latest.totalProbes > 0 && latest.failedProbes >= latest.totalProbes ? "failed" : "completed";
  return prisma.brandProbeRun.update({
    where: { id: runRecord.id },
    data: {
      status,
      currentStage: exploration.enabled ? "SEMANTIC_EXPLORATION_COMPLETED" : "PROBE_COMPLETED",
      finishedAt: new Date(),
    },
  }).then(async (updated) => {
    await recordTraceEvent({
      severity: status === "failed" ? "error" : "info",
      eventType: "brand_probe.run.completed",
      subsystem: "brand_probe",
      operation: "brand_probe_run",
      status,
      projectId: runRecord.projectId,
      analysisJobId: input.analysisJobId ?? runRecord.analysisJobId ?? undefined,
      objectType: "BrandProbeRun",
      objectId: runRecord.id,
      metadata: {
        completedProbes: updated.completedProbes,
        failedProbes: updated.failedProbes,
        actualThroughputPerMinute: updated.actualThroughputPerMinute,
      },
    });
    return updated;
  });
}

async function createBatches(runId: string, projectId: string, probes: BrandProbe[], batchSize: number) {
  const prisma = getPrisma();
  await prisma.brandProbeBatch.deleteMany({ where: { runId, status: "pending" } });
  const batches = buildMicroBatches(probes.map((probe) => ({ id: probe.id, payload: probe })), batchSize);
  await prisma.brandProbeBatch.createMany({
    data: batches.map((batch, index) => ({
      runId,
      projectId,
      batchIndex: index,
      probeIds: batch.map((item) => item.id),
      batchSize: batch.length,
      status: "pending",
      scheduledAt: new Date(),
      estimatedTokens: estimateBatchTokens(batch.map((item) => item.payload.prompt), batch.length === 1 ? 300 : 1200),
    })),
  });
  return prisma.brandProbeBatch.findMany({ where: { runId, status: "pending" }, orderBy: { batchIndex: "asc" } });
}

async function executeBatch(input: {
  batch: BrandProbeBatch;
  probes: ProbeWithRun[];
  providerId?: string;
  model: string;
  maxRetries: number;
  maxOutputTokens: number;
  temperature: number;
  brandAliases: string[];
  semanticExplorationEnabled: boolean;
}) {
  const prisma = getPrisma();
  await recordTraceEvent({
    severity: "info",
    eventType: "brand_probe.batch.started",
    subsystem: "brand_probe",
    operation: "brand_probe_batch",
    status: "running",
    projectId: input.batch.projectId,
    objectType: "BrandProbeBatch",
    objectId: input.batch.id,
    metadata: {
      batchIndex: input.batch.batchIndex,
      batchSize: input.probes.length,
      probeIds: input.probes.map((probe) => probe.id),
    },
  });
  await prisma.brandProbeBatch.update({
    where: { id: input.batch.id },
    data: { status: "running", startedAt: new Date() },
  });
  await prisma.brandProbe.updateMany({ where: { id: { in: input.probes.map((probe) => probe.id) } }, data: { status: "running" } });

  const result = input.probes.length === 1
    ? normalizeSingleResult(await executeSingleProbe({ ...input, probe: input.probes[0], retryCount: 0 }))
    : await executeMicroBatch(input);
  await prisma.brandProbeBatch.update({
    where: { id: input.batch.id },
    data: {
      status: result.failed > 0 && result.completed === 0 ? "failed" : "completed",
      completedAt: new Date(),
      actualTokens: result.tokens,
      latencyMs: result.latencyMs,
      errorMessage: result.error,
      splitReason: result.splitReason,
    },
  });
  await recordTraceEvent({
    severity: result.failed > 0 ? "warn" : "info",
    eventType: result.failed > 0 && result.completed === 0 ? "brand_probe.batch.failed" : "brand_probe.batch.completed",
    subsystem: "brand_probe",
    operation: "brand_probe_batch",
    status: result.failed > 0 && result.completed === 0 ? "failed" : "completed",
    projectId: input.batch.projectId,
    durationMs: result.latencyMs,
    errorCode: result.failed > 0 ? "PROBE_BATCH_PARTIAL_FAILURE" : undefined,
    errorMessage: result.error ?? undefined,
    objectType: "BrandProbeBatch",
    objectId: input.batch.id,
    metadata: {
      completed: result.completed,
      failed: result.failed,
      tokens: result.tokens,
      splitReason: result.splitReason,
      rateLimitErrors: result.rateLimitErrors,
      jsonFailures: result.jsonFailures,
    },
  });
  return result;
}

async function executeMicroBatch(input: {
  batch: BrandProbeBatch;
  probes: ProbeWithRun[];
  providerId?: string;
  model: string;
  maxRetries: number;
  maxOutputTokens: number;
  temperature: number;
  brandAliases: string[];
  semanticExplorationEnabled: boolean;
}) {
  const started = Date.now();
  const prompt = JSON.stringify({
    task: "请分别处理以下品牌语义探针。每个探针必须独立判断，不要互相影响。只输出 JSON 数组。",
    items: input.probes.map((probe) => ({ probe_id: probe.id, prompt: probe.prompt })),
    output_schema: "Array<ProbeResult>; every item must include the same probe_id from input.",
  });

  // Batch-level rate-limit handling: keep the batch intact and retry with
  // exponential backoff + jitter before falling back to per-probe splitting.
  const maxBatchRateLimitRetries = Math.min(Math.max(input.maxRetries, 1), 3);
  let rateLimitErrors = 0;

  for (let attempt = 0; ; attempt += 1) {
    const result = await runJsonPrompt({
      projectId: input.batch.projectId,
      subjectId: input.probes[0]?.subjectId ?? undefined,
      providerId: input.providerId,
      model: input.model,
      promptName: "brand_semantic_probe_batch",
      promptVersion: "v1",
      system: "You are a strict JSON executor for brand semantic probes. Return JSON only.",
      prompt,
      schema: probeBatchResponseSchema,
      schemaName: "brand_probe_batch_result",
      jsonSchema: input.semanticExplorationEnabled ? probeBatchResponseJsonSchema : legacyProbeBatchResponseJsonSchema,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      metadata: { batchId: input.batch.id, probeIds: input.probes.map((probe) => probe.id), attempt },
    });
    const usage = usageNumbers(result.usage);

    if (result.ok) {
      let completed = 0;
      let failed = 0;
      for (const probe of input.probes) {
        const item = result.data.find((entry) => entry.probe_id === probe.id);
        if (!item) {
          failed += 1;
          await markProbeFailed(probe, input.batch.id, input.model, "Batch output missed probe_id.", result.rawOutput, usage, Date.now() - started);
        } else {
          completed += 1;
          await persistProbeSuccess({ probe, batchId: input.batch.id, data: item, result, usage, latencyMs: Date.now() - started, brandAliases: input.brandAliases });
        }
      }
      return { completed, failed, tokens: usage.totalTokens ?? 0, latencyMs: Date.now() - started, jsonFailures: failed, rateLimitErrors, error: null, splitReason: null };
    }

    if (isRateLimitError(result.error)) {
      rateLimitErrors += 1;
      const willRetry = attempt < maxBatchRateLimitRetries;
      await recordTraceEvent({
        severity: "warn",
        eventType: "brand_probe.batch.rate_limited",
        subsystem: "brand_probe",
        operation: "brand_probe_batch",
        status: willRetry ? "retrying" : "failed",
        projectId: input.batch.projectId,
        errorCode: "RATE_LIMITED",
        errorMessage: result.error,
        objectType: "BrandProbeBatch",
        objectId: input.batch.id,
        metadata: { probeIds: input.probes.map((probe) => probe.id), attempt, willRetry },
      });
      if (willRetry) {
        await sleep(backoffMs(attempt));
        continue;
      }
      // Retries exhausted: persist each probe as failed so they don't stay
      // stuck in "running" and the run can complete deterministically.
      for (const probe of input.probes) {
        await markProbeFailed(probe, input.batch.id, input.model, result.error, result.rawOutput, usage, Date.now() - started);
      }
      return { completed: 0, failed: input.probes.length, tokens: usage.totalTokens ?? 0, latencyMs: Date.now() - started, jsonFailures: 0, rateLimitErrors, error: result.error, splitReason: "batch_rate_limited_exhausted" };
    }

    // Non-rate-limit structured error: fall back to per-probe execution.
    await recordTraceEvent({
      severity: "warn",
      eventType: "brand_probe.batch.split_to_single",
      subsystem: "brand_probe",
      operation: "brand_probe_batch",
      status: "retrying",
      projectId: input.batch.projectId,
      errorCode: "STRUCTURED_OUTPUT_ERROR",
      errorMessage: result.error,
      objectType: "BrandProbeBatch",
      objectId: input.batch.id,
      metadata: { probeIds: input.probes.map((probe) => probe.id) },
    });
    let completed = 0;
    let failed = 0;
    let tokens = usage.totalTokens ?? 0;
    for (const probe of input.probes) {
      const single = await executeSingleProbe({ ...input, probe, retryCount: 1 });
      completed += single.completed;
      failed += single.failed;
      tokens += single.tokens;
    }
    return { completed, failed, tokens, latencyMs: Date.now() - started, jsonFailures: 1, rateLimitErrors, error: result.error, splitReason: "batch_json_failed_split_to_single" };
  }
}

async function executeSingleProbe(input: {
  batch: BrandProbeBatch;
  probe: ProbeWithRun;
  providerId?: string;
  model: string;
  maxRetries: number;
  maxOutputTokens: number;
  temperature: number;
  brandAliases: string[];
  semanticExplorationEnabled: boolean;
  retryCount: number;
}) {
  const started = Date.now();
  let lastError: string | undefined;
  for (let attempt = input.retryCount; attempt <= input.maxRetries; attempt += 1) {
    const result = await runJsonPrompt({
      projectId: input.probe.projectId,
      subjectId: input.probe.subjectId ?? undefined,
      providerId: input.providerId,
      model: input.model,
      promptName: "brand_semantic_probe_single",
      promptVersion: "v1",
      system: "You are a strict JSON executor for one brand semantic probe. Return JSON only.",
      prompt: `${input.probe.prompt}\n\nprobe_id 必须等于：${input.probe.id}`,
      schema: probeResponseSchema,
      schemaName: "brand_probe_result",
      jsonSchema: input.semanticExplorationEnabled ? probeResponseJsonSchema : legacyProbeResponseJsonSchema,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
      metadata: { batchId: input.batch.id, probeId: input.probe.id, attempt },
    });
    const usage = usageNumbers(result.usage);
    if (result.ok) {
      await persistProbeSuccess({ probe: input.probe, batchId: input.batch.id, data: { ...result.data, probe_id: input.probe.id }, result, usage, latencyMs: Date.now() - started, brandAliases: input.brandAliases, retryCount: attempt });
      return { completed: 1, failed: 0, tokens: usage.totalTokens ?? 0, latencyMs: Date.now() - started };
    }
    lastError = result.error;
    if (!isRetryableError(result.error) || attempt === input.maxRetries) {
      await markProbeFailed(input.probe, input.batch.id, input.model, result.error, result.rawOutput, usage, Date.now() - started, attempt);
      return { completed: 0, failed: 1, tokens: usage.totalTokens ?? 0, latencyMs: Date.now() - started };
    }
    await sleep(backoffMs(attempt));
  }
  await markProbeFailed(input.probe, input.batch.id, input.model, lastError ?? "Probe failed.", undefined, usageNumbers(undefined), Date.now() - started, input.maxRetries);
  return { completed: 0, failed: 1, tokens: 0, latencyMs: Date.now() - started };
}

function normalizeSingleResult(result: { completed: number; failed: number; tokens: number; latencyMs: number }) {
  return {
    ...result,
    jsonFailures: result.failed,
    rateLimitErrors: 0,
    error: result.failed ? "single_probe_failed" : null,
    splitReason: null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function persistProbeSuccess(input: {
  probe: ProbeWithRun;
  batchId: string;
  data: ProbeResponseJson;
  result: { rawOutput?: string; providerId?: string; model?: string };
  usage: ReturnType<typeof usageNumbers>;
  latencyMs: number;
  brandAliases: string[];
  retryCount?: number;
}) {
  const prisma = getPrisma();
  const response = await prisma.brandProbeResponse.create({
    data: {
      runId: input.probe.runId,
      batchId: input.batchId,
      probeId: input.probe.id,
      projectId: input.probe.projectId,
      subjectId: input.probe.subjectId,
      providerId: input.result.providerId,
      model: input.result.model ?? "unknown",
      prompt: input.probe.prompt,
      rawResponse: input.result.rawOutput,
      parsedJson: input.data as unknown as Prisma.InputJsonValue,
      inputTokens: input.usage.promptTokens,
      outputTokens: input.usage.completionTokens,
      totalTokens: input.usage.totalTokens,
      cachedInputTokens: input.usage.cachedInputTokens,
      reasoningTokens: input.usage.reasoningTokens,
      latencyMs: input.latencyMs,
      retryCount: input.retryCount ?? 0,
    },
  });
  const signals = extractSignals({
    data: input.data,
    runId: input.probe.runId,
    responseId: response.id,
    projectId: input.probe.projectId,
    subjectId: input.probe.subjectId,
    probeId: input.probe.id,
    brandAliases: input.brandAliases,
  });
  if (signals.length) await prisma.extractedSignal.createMany({ data: signals });
  await prisma.brandProbe.update({ where: { id: input.probe.id }, data: { status: "completed" } });
  await recordTraceEvent({
    severity: "info",
    eventType: "brand_probe.probe.succeeded",
    subsystem: "brand_probe",
    operation: "brand_probe_sampling",
    status: "succeeded",
    projectId: input.probe.projectId,
    runId: input.probe.runId,
    promptRunId: "promptRunId" in input.result ? String(input.result.promptRunId) : undefined,
    objectType: "BrandProbe",
    objectId: input.probe.id,
    durationMs: input.latencyMs,
    metadata: {
      batchId: input.batchId,
      responseId: response.id,
      signalCount: signals.length,
      retryCount: input.retryCount ?? 0,
      totalTokens: input.usage.totalTokens,
    },
  });
}

async function markProbeFailed(
  probe: ProbeWithRun,
  batchId: string,
  model: string,
  error: string,
  rawOutput: string | undefined,
  usage: ReturnType<typeof usageNumbers>,
  latencyMs: number,
  retryCount = 0,
) {
  const prisma = getPrisma();
  await prisma.brandProbeResponse.create({
    data: {
      runId: probe.runId,
      batchId,
      probeId: probe.id,
      projectId: probe.projectId,
      subjectId: probe.subjectId,
      model,
      prompt: probe.prompt,
      rawResponse: rawOutput,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      latencyMs,
      retryCount,
      errorMessage: error,
    },
  });
  await prisma.brandProbe.update({ where: { id: probe.id }, data: { status: "failed" } });
  await recordTraceEvent({
    severity: "error",
    eventType: "brand_probe.probe.failed",
    subsystem: "brand_probe",
    operation: "brand_probe_sampling",
    status: "failed",
    projectId: probe.projectId,
    runId: probe.runId,
    errorCode: isRateLimitError(error) ? "RATE_LIMITED" : "PROBE_RESPONSE_FAILED",
    errorMessage: error,
    objectType: "BrandProbe",
    objectId: probe.id,
    durationMs: latencyMs,
    metadata: {
      batchId,
      retryCount,
      totalTokens: usage.totalTokens,
    },
  });
}

function isRateLimitError(error: string) {
  return /429|rate.?limit|too many requests/i.test(error);
}

function isRetryableError(error: string) {
  return isRateLimitError(error) || /timeout|network|fetch|temporarily|503|502/i.test(error);
}

function backoffMs(attempt: number) {
  return Math.min(30000, 750 * 2 ** attempt + Math.floor(Math.random() * 500));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

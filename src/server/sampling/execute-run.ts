import type { Prisma } from "@/generated/prisma/client";
import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { platformFromProviderType } from "@/server/ai/platform";
import { getProviderRuntimeContext, logAIUsage } from "@/server/ai/provider-registry";
import { finalizeExperimentWavesForRun } from "@/server/analysis/proof-service";
import { analyzeResponse } from "@/server/analysis/response-analyzer";
import { createSemanticCoverageSnapshot } from "@/server/analysis/semantic-coverage";
import { createRunStatistics } from "@/server/analysis/stability";
import { getPrisma } from "@/server/db";
import { storeObjectArtifact } from "@/server/external/object-storage";
import { buildCipMetricBundle, metricSnapshotDataFromBundle, modelKeyFromParts } from "@/server/metrics/cip-metrics";
import { runWithConcurrency } from "@/server/orchestration/concurrency";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function executeSamplingRun(runId: string, requestedByUserId?: string) {
  const prisma = getPrisma();
  const run = await prisma.samplingRun.findUnique({
    where: { id: runId },
    include: { project: true, subject: true },
  });

  if (!run) {
    throw new Error("Sampling run not found.");
  }

  const queries = await prisma.aeoQuery.findMany({
    where: {
      projectId: run.projectId,
      ...(run.selectedQueryIds.length ? { id: { in: run.selectedQueryIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  if (queries.length === 0) {
    throw new Error("No queries are attached to this run.");
  }

  const failures: string[] = [];
  let responsesCreated = 0;
  const collectedResponseIds: string[] = [];

  await prisma.samplingRun.update({
    where: { id: run.id },
    data: { status: "running", startedAt: new Date() },
  });

  const configuredModelMatrix = modelMatrixFromSamplingStrategy(run.samplingStrategy);
  const fixedModelMatrix = configuredModelMatrix.length ? configuredModelMatrix : null;
  const jobs = queries.flatMap((query) =>
    (fixedModelMatrix ?? [null]).flatMap((modelLane, modelIndex) =>
      Array.from({ length: run.sampleCountPerQuery }, (_, sampleIndex) => ({
        query,
        sampleIndex,
        modelIndex,
        modelLane,
      })),
    ),
  );
  const laneContexts = fixedModelMatrix
    ? await Promise.all(
        fixedModelMatrix.map(async (lane, laneIndex) => {
          const context = await getProviderRuntimeContext(lane.providerId);
          const modelRecord = lane.modelId
            ? await prisma.aIModel.findUnique({ where: { id: lane.modelId } })
            : await prisma.aIModel.findFirst({
                where: {
                  providerId: context.provider.id,
                  OR: [{ name: lane.model }, { displayName: lane.model }],
                },
              });
          const model = modelRecord?.name ?? lane.model;
          return {
            lane: { laneIndex, providerId: context.provider.id, providerName: context.provider.name, model, source: "routing_rule" as const },
            provider: context.provider,
            runtime: context.runtime,
            modelRecord,
            modelKey: lane.modelKey ?? modelKeyFromParts({ providerId: context.provider.id, modelId: modelRecord?.id, model }),
          };
        }),
      )
    : await buildRoutedLaneContexts(jobs.length);
  const laneCount = fixedModelMatrix ? Math.min(Math.max(laneContexts.length, 1), 8) : Math.max(1, laneContexts.length);

  await runWithConcurrency(jobs, laneCount, async (job, _jobIndex, laneIndex) => {
    const { query, sampleIndex } = job;
    const laneContext = fixedModelMatrix
      ? laneContexts[job.modelIndex % laneContexts.length]
      : laneContexts[laneIndex % laneContexts.length];
    const started = Date.now();
    const persona = query.personaType ?? query.persona ?? "buyer";
    const region = query.region ?? "US";
    try {
      await prisma.querySample.upsert({
        where: {
          runId_queryId_modelKey_sampleIndex: {
            runId: run.id,
            queryId: query.id,
            modelKey: laneContext.modelKey,
            sampleIndex,
          },
        },
        update: {
          status: "running",
          persona: String(persona),
          region,
          providerId: laneContext.provider.id,
          modelId: laneContext.modelRecord?.id,
          model: laneContext.lane.model,
        },
        create: {
          projectId: run.projectId,
          runId: run.id,
          queryId: query.id,
          modelKey: laneContext.modelKey,
          providerId: laneContext.provider.id,
          modelId: laneContext.modelRecord?.id,
          model: laneContext.lane.model,
          sampleIndex,
          persona: String(persona),
          region,
          contextMode: query.contextMode,
          status: "running",
        },
      });

      const result = await laneContext.runtime.generateText({
        system: [
          "You answer as a mainstream AI assistant.",
          "Provide a helpful answer to the user query.",
          "Do not mention that this is an audit.",
          `Assume persona: ${persona}. Region: ${region}. Context: ${query.contextMode}.`,
        ].join(" "),
        prompt: query.queryText,
        operation: "answer_sampling",
        model: laneContext.lane.model,
      });

      const rawResponse = JSON.stringify(result.raw);
      const objectKey =
        rawResponse.length > 100_000
          ? `ai-responses/${run.projectId}/${run.id}/${query.id}-${sampleIndex}.json`
          : null;
      if (objectKey) {
        await storeObjectArtifact({
          projectId: run.projectId,
          artifactType: "ai_response",
          objectKey,
          body: rawResponse,
          contentType: "application/json",
        });
      }

      const response = await prisma.aIResponse.create({
        data: {
          runId: run.id,
          queryId: query.id,
          providerId: laneContext.provider.id,
          modelId: laneContext.modelRecord?.id,
          platform: platformFromProviderType(laneContext.provider.providerType),
          model: laneContext.lane.model,
          sampleIndex,
          region,
          persona: String(persona),
          objectKey,
          rawResponse: objectKey ? `stored:${objectKey}` : rawResponse,
          normalizedAnswer: result.text,
          citations: (asRecord(result.raw).citations ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        },
      });

      await prisma.querySample.update({
        where: {
          runId_queryId_modelKey_sampleIndex: {
            runId: run.id,
            queryId: query.id,
            modelKey: laneContext.modelKey,
            sampleIndex,
          },
        },
        data: { status: "completed", responseId: response.id },
      });

      await logAIUsage({
        providerId: laneContext.provider.id,
        modelId: laneContext.modelRecord?.id,
        projectId: run.projectId,
        organizationId: run.project.organizationId ?? undefined,
        userId: requestedByUserId,
        operation: "answer_sampling",
        model: laneContext.lane.model,
        status: "success",
        usage: result.usage,
        latencyMs: Date.now() - started,
        metadata: { runId: run.id, queryId: query.id, sampleIndex, laneIndex, laneModel: laneContext.lane.model, modelKey: laneContext.modelKey },
      });

      collectedResponseIds.push(response.id);
      responsesCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sampling failed.";
      failures.push(`${query.id}: ${message}`);
      await prisma.querySample.upsert({
        where: {
          runId_queryId_modelKey_sampleIndex: {
            runId: run.id,
            queryId: query.id,
            modelKey: laneContext.modelKey,
            sampleIndex,
          },
        },
        update: {
          status: "failed",
          error: message,
          providerId: laneContext.provider.id,
          modelId: laneContext.modelRecord?.id,
          model: laneContext.lane.model,
        },
        create: {
          projectId: run.projectId,
          runId: run.id,
          queryId: query.id,
          modelKey: laneContext.modelKey,
          providerId: laneContext.provider.id,
          modelId: laneContext.modelRecord?.id,
          model: laneContext.lane.model,
          sampleIndex,
          persona: String(persona),
          region,
          contextMode: query.contextMode,
          status: "failed",
          error: message,
        },
      });
      await logAIUsage({
        providerId: laneContext.provider.id,
        modelId: laneContext.modelRecord?.id,
        projectId: run.projectId,
        organizationId: run.project.organizationId ?? undefined,
        userId: requestedByUserId,
        operation: "answer_sampling",
        model: laneContext.lane.model,
        status: "failed",
        latencyMs: Date.now() - started,
        error: message,
        metadata: { runId: run.id, queryId: query.id, sampleIndex, laneIndex, laneModel: laneContext.lane.model, modelKey: laneContext.modelKey },
      });
    }
  });

  // Run answer extraction after all sampling lanes finish so sampling throughput is not blocked.
  const analysisLanes = Math.min(laneCount, 4);
  await runWithConcurrency(collectedResponseIds, analysisLanes, async (responseId) => {
    await analyzeResponse(responseId, requestedByUserId).catch((error) => {
      failures.push(`analysis:${responseId}: ${error instanceof Error ? error.message : "unknown"}`);
    });
  });

  const status = failures.length === 0 ? "completed" : responsesCreated > 0 ? "partially_failed" : "failed";
  await createRunStatistics(run.projectId, run.id).catch(() => null);
  await createSemanticCoverageSnapshot(run.projectId).catch(() => null);
  const bundle = await buildCipMetricBundle(run.projectId, run.subjectId);
  await prisma.metricSnapshot.create({
    data: metricSnapshotDataFromBundle({
      projectId: run.projectId,
      subjectId: run.subjectId,
      runId: run.id,
      bundle,
      source: "executeSamplingRun",
    }),
  }).catch(() => null);
  await finalizeExperimentWavesForRun(run.id).catch(() => null);

  return prisma.samplingRun.update({
    where: { id: run.id },
    data: {
      status,
      completedAt: new Date(),
      sampleCount: responsesCreated,
      failureSummary: failures.join("\n") || null,
    },
  });
}

async function buildRoutedLaneContexts(workUnits: number) {
  const prisma = getPrisma();
  const plan = await resolveTaskExecutionPlan({
    task: "answer_sampling",
    workUnits,
  });
  return Promise.all(
    plan.lanes.map(async (lane) => {
      const context = await getProviderRuntimeContext(lane.providerId);
      const modelRecord = await prisma.aIModel.findFirst({
        where: {
          providerId: context.provider.id,
          OR: [{ name: lane.model }, { displayName: lane.model }],
        },
      });
      return {
        lane,
        provider: context.provider,
        runtime: context.runtime,
        modelRecord,
        modelKey: modelKeyFromParts({ providerId: context.provider.id, modelId: modelRecord?.id, model: lane.model }),
      };
    }),
  );
}

function modelMatrixFromSamplingStrategy(value: unknown) {
  const record = asRecord(value);
  return asArray(record.modelMatrix)
    .map((item) => {
      const row = asRecord(item);
      const providerId = typeof row.providerId === "string" ? row.providerId : "";
      const model = typeof row.model === "string" ? row.model : "";
      if (!providerId || !model) return null;
      return {
        providerId,
        providerName: typeof row.providerName === "string" ? row.providerName : null,
        modelId: typeof row.modelId === "string" ? row.modelId : null,
        model,
        platform: typeof row.platform === "string" ? row.platform : null,
        modelKey: typeof row.modelKey === "string" ? row.modelKey : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

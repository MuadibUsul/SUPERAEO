import type { Prisma } from "@/generated/prisma/client";
import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { getProviderRuntimeContext, logAIUsage } from "@/server/ai/provider-registry";
import { analyzeResponse } from "@/server/analysis/response-analyzer";
import { createSemanticCoverageSnapshot } from "@/server/analysis/semantic-coverage";
import { createRunStatistics } from "@/server/analysis/stability";
import { getPrisma } from "@/server/db";
import { storeObjectArtifact } from "@/server/external/object-storage";
import { buildCipMetricBundle } from "@/server/metrics/cip-metrics";
import { runWithConcurrency } from "@/server/orchestration/concurrency";

function platformFromProvider(providerType: string) {
  if (providerType === "perplexity_sonar") return "perplexity";
  if (providerType === "anthropic_messages") return "anthropic";
  if (providerType === "gemini_native") return "gemini";
  if (providerType === "openai_compatible") return "openai_compatible";
  return "openai";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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

  await prisma.samplingRun.update({
    where: { id: run.id },
    data: { status: "running", startedAt: new Date() },
  });

  const jobs = queries.flatMap((query) =>
    Array.from({ length: run.sampleCountPerQuery }, (_, sampleIndex) => ({
      query,
      sampleIndex,
    })),
  );
  const plan = await resolveTaskExecutionPlan({
    task: "answer_sampling",
    workUnits: jobs.length,
  });
  const laneContexts = await Promise.all(
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
      };
    }),
  );

  await runWithConcurrency(jobs, plan.laneCount, async (job, _jobIndex, laneIndex) => {
    const { query, sampleIndex } = job;
    const laneContext = laneContexts[laneIndex % laneContexts.length];
    const started = Date.now();
    const persona = query.personaType ?? query.persona ?? "buyer";
    const region = query.region ?? "US";
    try {
      await prisma.querySample.upsert({
        where: {
          runId_queryId_sampleIndex: {
            runId: run.id,
            queryId: query.id,
            sampleIndex,
          },
        },
        update: { status: "running", persona: String(persona), region },
        create: {
          projectId: run.projectId,
          runId: run.id,
          queryId: query.id,
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
          platform: platformFromProvider(laneContext.provider.providerType),
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
          runId_queryId_sampleIndex: {
            runId: run.id,
            queryId: query.id,
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
        status: "success",
        usage: result.usage,
        latencyMs: Date.now() - started,
        metadata: { runId: run.id, queryId: query.id, sampleIndex, laneIndex, laneModel: laneContext.lane.model },
      });

      await analyzeResponse(response.id, requestedByUserId).catch((error) => {
        failures.push(`${query.id}: analysis failed: ${error instanceof Error ? error.message : "unknown"}`);
      });

      responsesCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sampling failed.";
      failures.push(`${query.id}: ${message}`);
      await prisma.querySample.upsert({
        where: {
          runId_queryId_sampleIndex: {
            runId: run.id,
            queryId: query.id,
            sampleIndex,
          },
        },
        update: { status: "failed", error: message },
        create: {
          projectId: run.projectId,
          runId: run.id,
          queryId: query.id,
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
        status: "failed",
        latencyMs: Date.now() - started,
        error: message,
        metadata: { runId: run.id, queryId: query.id, sampleIndex, laneIndex, laneModel: laneContext.lane.model },
      });
    }
  });

  const status = failures.length === 0 ? "completed" : responsesCreated > 0 ? "partially_failed" : "failed";
  await createRunStatistics(run.projectId, run.id).catch(() => null);
  await createSemanticCoverageSnapshot(run.projectId).catch(() => null);
  const bundle = await buildCipMetricBundle(run.projectId, run.subjectId);
  await prisma.metricSnapshot.create({
    data: {
      projectId: run.projectId,
      subjectId: run.subjectId,
      runId: run.id,
      sampleCount: bundle.sampleCount,
      aiAnswerInclusionScore: bundle.metrics.aiVisibilityScore,
      aiVisibilityScore: bundle.metrics.aiVisibilityScore,
      mentionRate: bundle.metrics.mentionRate,
      recommendationShare: bundle.metrics.recommendationShare,
      citationRate: bundle.metrics.citationRate,
      aiImpressionShare: bundle.metrics.aiImpressionShare,
      entityVisibility: bundle.metrics.entityVisibility,
      semanticCoverage: bundle.metrics.semanticCoverage,
      semanticUniverseStrength: bundle.metrics.semanticCoverage,
      stabilityScore: bundle.metrics.stabilityIndex,
      stabilityIndex: bundle.metrics.stabilityIndex,
      descriptionAccuracy: bundle.metrics.entityVisibility,
      hallucinationRiskScore: bundle.metrics.hallucinationRiskScore,
      competitorGap: bundle.metrics.competitorDelta,
      confidenceMetadata: bundle.confidence as Prisma.InputJsonValue,
      metadata: { source: "executeSamplingRun" } as Prisma.InputJsonValue,
    },
  }).catch(() => null);

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

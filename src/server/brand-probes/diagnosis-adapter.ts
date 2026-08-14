import type { Prisma } from "@/generated/prisma/client";

import { platformFromProviderType } from "@/server/ai/platform";
import { createRunStatistics } from "@/server/analysis/stability";
import { getPrisma } from "@/server/db";
import { buildCipMetricBundle, metricSnapshotDataFromBundle } from "@/server/metrics/cip-metrics";
import { inferMentionedBrand } from "@/server/brand-probes/signal-extractor";
import { probeResponseSchema } from "@/server/brand-probes/types";

export async function materializeBrandProbeRunForDiagnosis(brandProbeRunId: string) {
  const prisma = getPrisma();
  const brandRun = await prisma.brandProbeRun.findUnique({
    where: { id: brandProbeRunId },
    include: {
      project: true,
      subject: true,
      probes: {
        include: { responses: { where: { errorMessage: null }, orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!brandRun) throw new Error("Brand probe run not found for diagnosis projection.");

  const successful = brandRun.probes.flatMap((probe) => probe.responses.map((response) => ({ probe, response })));
  if (successful.length === 0) throw new Error("Semantic exploration produced no successful responses.");

  const queries = await prisma.aeoQuery.createManyAndReturn({
    data: successful.map(({ probe }) => {
      const variables = asRecord(probe.variablesJson);
      return {
        projectId: brandRun.projectId,
        subjectId: brandRun.subjectId,
        queryText: probe.prompt,
        queryType: queryTypeForZone(probe.zone),
        persona: stringValue(variables.audience) || null,
        personaType: "buyer" as const,
        region: "US",
        contextMode: probe.zone === "competition" ? "competitive_context" as const : "cold_start" as const,
        queryDepthLevel: queryDepthLevel(variables.depthLevel),
        intent: `brand_probe:${probe.id}`,
        confidence: probe.qualityScore,
      };
    }),
    select: { id: true, intent: true },
  });
  const queryIdsByProbe = new Map(
    queries.map((query) => [String(query.intent).replace(/^brand_probe:/, ""), query.id]),
  );

  const exploration = asRecord(asRecord(brandRun.configJson).semanticExploration);
  const samplingRun = await prisma.samplingRun.create({
    data: {
      projectId: brandRun.projectId,
      subjectId: brandRun.subjectId,
      runType: "baseline",
      status: brandRun.status === "failed" ? "failed" : brandRun.failedProbes > 0 ? "partially_failed" : "completed",
      platforms: [],
      sampleCount: successful.length,
      sampleCountPerQuery: 1,
      selectedQueryIds: queries.map((query) => query.id),
      samplingStrategy: {
        source: "semantic_exploration",
        brandProbeRunId: brandRun.id,
        seedMode: brandRun.mode,
        iterations: Array.isArray(exploration.history) ? exploration.history.length : 0,
        stopReason: exploration.stopReason ?? null,
        totalProbes: brandRun.totalProbes,
      },
      failureSummary: brandRun.failedProbes > 0 ? `${brandRun.failedProbes} semantic probes failed.` : null,
      scheduledAt: brandRun.createdAt,
      startedAt: brandRun.startedAt,
      completedAt: brandRun.finishedAt ?? new Date(),
      traceId: `semantic-exploration:${brandRun.id}`,
    },
  });

  const providerIds = Array.from(new Set(successful.map(({ response }) => response.providerId).filter((id): id is string => Boolean(id))));
  const providers = await prisma.aIProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true, providerType: true } });
  const providerTypes = new Map(providers.map((provider) => [provider.id, provider.providerType]));
  const createdResponses = await prisma.aIResponse.createManyAndReturn({
    data: successful.map(({ probe, response }) => {
      const queryId = queryIdsByProbe.get(probe.id);
      if (!queryId) throw new Error(`Missing projected query for probe ${probe.id}.`);
      const parsed = asRecord(response.parsedJson);
      const raw = response.rawResponse || JSON.stringify(parsed);
      return {
        runId: samplingRun.id,
        queryId,
        providerId: response.providerId,
        platform: platformFromProviderType(response.providerId ? providerTypes.get(response.providerId) ?? "openai" : "openai"),
        model: response.model,
        sampleIndex: 0,
        region: "US",
        persona: stringValue(asRecord(probe.variablesJson).audience) || null,
        objectKey: `brand_probe_response:${response.id}`,
        rawResponse: raw,
        normalizedAnswer: raw,
        citations: [] as Prisma.InputJsonValue,
      };
    }),
    select: { id: true, objectKey: true },
  });
  const responseIds = new Map(
    createdResponses.map((response) => [String(response.objectKey).replace(/^brand_probe_response:/, ""), response.id]),
  );
  const aliases = [brandRun.project.brandName, brandRun.subject?.displayName, brandRun.subject?.canonicalName]
    .filter((value): value is string => Boolean(value))
    .map(normalize);

  await prisma.answerAnalysis.createMany({
    data: successful.map(({ response }) => {
      const responseId = responseIds.get(response.id);
      if (!responseId) throw new Error(`Missing projected response for brand probe response ${response.id}.`);
      const parsed = asRecord(response.parsedJson);
      const normalizedResponse = probeResponseSchema.safeParse(parsed);
      const recommendations = arrayRecords(parsed.recommended_brands);
      const brandPosition = recommendations.findIndex((item) => aliases.includes(normalize(stringValue(item.brand))));
      const semanticUnitTerms = arrayRecords(parsed.semantic_units)
        .flatMap((unit) => [stringValue(unit.canonicalLabel), stringValue(unit.surfaceForm), stringValue(unit.object)])
        .filter(Boolean);
      const keywordValues = ["keywords", "scenarios", "audiences", "risk_words", "opportunity_words"]
        .flatMap((field) => stringArray(parsed[field]))
        .concat(semanticUnitTerms);
      return {
        responseId,
        brandMentioned: normalizedResponse.success
          ? inferMentionedBrand(normalizedResponse.data, aliases)
          : parsed.mentioned_brand === true,
        brandRecommended: brandPosition >= 0,
        brandPosition: brandPosition >= 0 ? brandPosition + 1 : null,
        competitorsMentioned: stringArray(parsed.competitors) as Prisma.InputJsonValue,
        recommendationWinner: stringValue(recommendations[0]?.brand) || null,
        sentiment: sentimentFromScore(parsed.sentiment_score),
        matchedKeywords: Array.from(new Set(keywordValues)) as Prisma.InputJsonValue,
        citationsUsed: [] as Prisma.InputJsonValue,
        possibleHallucinations: [] as Prisma.InputJsonValue,
        confidence: numberValue(parsed.confidence, 0.5),
        rawAnalysis: parsed as unknown as Prisma.InputJsonValue,
      };
    }),
  });

  await prisma.samplingRun.update({
    where: { id: samplingRun.id },
    data: {
      platforms: Array.from(new Set(createdResponses.map((response) => {
        const sourceId = String(response.objectKey).replace(/^brand_probe_response:/, "");
        const source = successful.find((item) => item.response.id === sourceId)?.response;
        return platformFromProviderType(source?.providerId ? providerTypes.get(source.providerId) ?? "openai" : "openai");
      }))),
      sampleCount: createdResponses.length,
    },
  });

  await createRunStatistics(brandRun.projectId, samplingRun.id).catch(() => null);
  const bundle = await buildCipMetricBundle(brandRun.projectId, brandRun.subjectId);
  await prisma.metricSnapshot.create({
    data: metricSnapshotDataFromBundle({
      projectId: brandRun.projectId,
      subjectId: brandRun.subjectId,
      runId: samplingRun.id,
      bundle,
      source: "semantic_exploration_projection",
    }),
  });

  return prisma.samplingRun.findUniqueOrThrow({ where: { id: samplingRun.id } });
}

function queryTypeForZone(zone: string) {
  if (zone === "competition") return "comparison" as const;
  if (zone === "risk_boundary") return "risk" as const;
  if (zone === "scenario_fit") return "use_case" as const;
  if (zone === "implicit_recommendation" || zone === "growth_opportunity") return "recommendation" as const;
  if (zone === "audience_fit") return "buyer_decision" as const;
  return "education" as const;
}

function queryDepthLevel(value: unknown) {
  if (value === "decision") return "decision" as const;
  if (value === "comparison") return "comparison" as const;
  if (value === "rationale") return "sub_question" as const;
  return "primary" as const;
}

function sentimentFromScore(value: unknown) {
  const score = numberValue(value, 0);
  if (score > 0.2) return "positive" as const;
  if (score < -0.2) return "negative" as const;
  return "neutral" as const;
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

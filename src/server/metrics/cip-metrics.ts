import type { Prisma, SubjectEntityType } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { stabilityIndex, wilsonInterval } from "@/server/observability/statistics";
import { clamp01, isRecord, numberOrDefault, stringOrDefault, stringOrNull } from "@/server/utils/coerce";

export type EntityMetrics = {
  factualAccuracy: number;
  featureAccuracy: number;
  authority: number;
  identityConfusionRisk: number;
  parameterErrorRate: number;
  accuracyScore: number;
};

export type ModelBreakdown = {
  modelKey: string;
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  model: string;
  platform: string;
  sampleCount: number;
  mentionRate: number;
  recommendationShare: number;
  citationRate: number;
  accuracyScore: number;
};

export type CipMetricBundle = {
  runId: string | null;
  sampleCount: number;
  metrics: {
    aiVisibilityScore: number;
    citationRate: number;
    mentionRate: number;
    recommendationShare: number;
    aiImpressionShare: number;
    entityVisibility: number;
    semanticCoverage: number;
    stabilityIndex: number;
    hallucinationRiskScore: number;
    competitorDelta: number;
  };
  entityMetrics: EntityMetrics;
  modelBreakdown: ModelBreakdown[];
  confidence: {
    mentionRate?: { estimate: number; lowerBound: number; upperBound: number };
    citationRate?: { estimate: number; lowerBound: number; upperBound: number };
    recommendationShare?: { estimate: number; lowerBound: number; upperBound: number };
  };
};

export async function getLatestCipMetricBundle(projectId: string, subjectId?: string | null): Promise<CipMetricBundle> {
  const snapshot = await getPrisma().metricSnapshot.findFirst({
    where: { projectId, ...(subjectId ? { subjectId } : {}) },
    orderBy: { createdAt: "desc" },
  });

  if (snapshot) {
    return bundleFromSnapshot(snapshot);
  }

  return buildCipMetricBundle(projectId, subjectId);
}

export async function buildCipMetricBundle(projectId: string, subjectId?: string | null): Promise<CipMetricBundle> {
  const prisma = getPrisma();
  const latestRun = await prisma.samplingRun.findFirst({
    where: { projectId, ...(subjectId ? { subjectId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      subject: true,
      responses: {
        include: {
          analysis: true,
          citationSources: true,
          provider: { select: { id: true, name: true } },
          probeResults: {
            where: { probeFamily: "answer_extraction" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!latestRun) {
    return {
      runId: null,
      sampleCount: 0,
      metrics: emptyMetrics(),
      entityMetrics: emptyEntityMetrics(),
      modelBreakdown: [],
      confidence: {},
    };
  }

  const responses = latestRun.responses;
  const sampleCount = responses.length;
  const mentioned = responses.filter((response) => targetMentioned(response)).length;
  const recommended = responses.filter((response) => targetRecommended(response)).length;
  const cited = responses.filter((response) => targetCited(response)).length;
  const [hallucinationAlerts, semanticCoverage, entityProfile, entityType] = await Promise.all([
    prisma.alert.count({ where: { projectId, severity: { in: ["P1", "P2"] }, status: "open" } }),
    prisma.semanticCoverageSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    prisma.entityProfile.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
    latestRun.subject?.entityType
      ? Promise.resolve(latestRun.subject.entityType)
      : inferSubjectType(projectId, subjectId),
  ]);
  const mentionRate = sampleCount ? mentioned / sampleCount : 0;
  const citationRate = sampleCount ? cited / sampleCount : 0;
  const recommendationShare = sampleCount ? recommended / sampleCount : 0;
  const entityVisibility = entityProfile?.authorityScore ?? mentionRate;
  const coverage = semanticCoverage?.overallCoverage ?? 0;
  const stability = stabilityIndex(responses.map((response) => targetMentioned(response)));
  const hallucinationRiskScore = Math.min(1, hallucinationAlerts / Math.max(1, sampleCount));
  const entityMetrics = aggregateEntityMetrics(
    responses.map((response) => normalizedEntityAccuracy(response)),
    entityType,
    entityProfile?.authorityScore ?? 0,
  );
  const modelBreakdown = aggregateModelBreakdown(responses, entityType);
  const aiVisibilityScore =
    0.22 * mentionRate +
    0.18 * citationRate +
    0.18 * recommendationShare +
    0.14 * entityVisibility +
    0.1 * coverage +
    0.08 * stability +
    0.1 * entityMetrics.accuracyScore -
    0.1 * hallucinationRiskScore;

  return {
    runId: latestRun.id,
    sampleCount,
    metrics: {
      aiVisibilityScore: Math.max(0, Math.min(1, aiVisibilityScore)),
      citationRate,
      mentionRate,
      recommendationShare,
      aiImpressionShare: mentionRate,
      entityVisibility,
      semanticCoverage: coverage,
      stabilityIndex: stability,
      hallucinationRiskScore,
      competitorDelta: 0,
    },
    entityMetrics,
    modelBreakdown,
    confidence: {
      mentionRate: wilsonInterval(mentioned, sampleCount),
      citationRate: wilsonInterval(cited, sampleCount),
      recommendationShare: wilsonInterval(recommended, sampleCount),
    },
  };
}

export function metricSnapshotDataFromBundle(input: {
  projectId: string;
  subjectId?: string | null;
  runId: string;
  bundle: CipMetricBundle;
  source: string;
}): Prisma.MetricSnapshotUncheckedCreateInput {
  const { bundle } = input;
  return {
    projectId: input.projectId,
    subjectId: input.subjectId ?? null,
    runId: input.runId,
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
    descriptionAccuracy: bundle.entityMetrics.accuracyScore,
    hallucinationRiskScore: bundle.metrics.hallucinationRiskScore,
    competitorGap: bundle.metrics.competitorDelta,
    confidenceMetadata: bundle.confidence as Prisma.InputJsonValue,
    metadata: {
      source: input.source,
      entityMetrics: bundle.entityMetrics,
      modelBreakdown: bundle.modelBreakdown,
    } as Prisma.InputJsonValue,
  };
}

type ResponseWithNormalizedResult = {
  platform: string;
  model: string;
  providerId: string | null;
  modelId: string | null;
  provider: { id: string; name: string } | null;
  analysis: { brandMentioned: boolean; brandRecommended: boolean } | null;
  citationSources: Array<{ supportsBrand: boolean }>;
  probeResults: Array<{ normalizedJson: unknown }>;
};

function targetMentioned(response: Pick<ResponseWithNormalizedResult, "analysis" | "probeResults">) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetMentioned === "boolean") return normalized.targetMentioned;
  return Boolean(response.analysis?.brandMentioned);
}

function targetRecommended(response: Pick<ResponseWithNormalizedResult, "analysis" | "probeResults">) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetRecommended === "boolean") return normalized.targetRecommended;
  return Boolean(response.analysis?.brandRecommended);
}

function targetCited(response: Pick<ResponseWithNormalizedResult, "citationSources" | "probeResults">) {
  const normalized = normalizedResult(response);
  const citations = Array.isArray(normalized.citations) ? normalized.citations : [];
  if (citations.some((citation) => isRecord(citation) && citation.supportsTarget === true)) return true;
  return response.citationSources.some((source) => source.supportsBrand);
}

function normalizedResult(response: { probeResults: Array<{ normalizedJson: unknown }> }) {
  const value = response.probeResults[0]?.normalizedJson;
  return isRecord(value) ? value : {};
}

function normalizedEntityAccuracy(response: { probeResults: Array<{ normalizedJson: unknown }> }) {
  const normalized = normalizedResult(response);
  const accuracy = isRecord(normalized.entityAccuracy) ? normalized.entityAccuracy : {};
  return {
    factualAccuracy: clamp01(numberOrDefault(accuracy.factualAccuracy, 0.5)),
    featureAccuracy: clamp01(numberOrDefault(accuracy.featureAccuracy, 0.5)),
    identityConfusionRisk: clamp01(numberOrDefault(accuracy.identityConfusionRisk, 0)),
    parameterErrorRate: clamp01(numberOrDefault(accuracy.parameterErrorRate, 0)),
    confidence: clamp01(numberOrDefault(accuracy.confidence, 0.5)),
  };
}

function aggregateEntityMetrics(
  accuracyRows: ReturnType<typeof normalizedEntityAccuracy>[],
  entityType: SubjectEntityType,
  authority: number,
): EntityMetrics {
  if (accuracyRows.length === 0) {
    return {
      ...emptyEntityMetrics(),
      authority,
      accuracyScore: primaryAccuracyForEntity(entityType, emptyEntityMetrics(), authority),
    };
  }

  const factualAccuracy = weightedAverage(accuracyRows, (row) => row.factualAccuracy);
  const featureAccuracy = weightedAverage(accuracyRows, (row) => row.featureAccuracy);
  const identityConfusionRisk = weightedAverage(accuracyRows, (row) => row.identityConfusionRisk);
  const parameterErrorRate = weightedAverage(accuracyRows, (row) => row.parameterErrorRate);
  const partial = { factualAccuracy, featureAccuracy, identityConfusionRisk, parameterErrorRate, authority, accuracyScore: 0 };
  return {
    ...partial,
    accuracyScore: primaryAccuracyForEntity(entityType, partial, authority),
  };
}

function primaryAccuracyForEntity(entityType: SubjectEntityType, metrics: Omit<EntityMetrics, "accuracyScore">, authority: number) {
  if (entityType === "PRODUCT") return metrics.featureAccuracy;
  if (entityType === "WEBSITE") return authority;
  if (entityType === "PERSON") return metrics.factualAccuracy;
  return Math.max(0, metrics.factualAccuracy - metrics.identityConfusionRisk * 0.25 - metrics.parameterErrorRate * 0.25);
}

function weightedAverage<T extends { confidence: number }>(rows: T[], pick: (row: T) => number) {
  const totalWeight = rows.reduce((sum, row) => sum + Math.max(0.05, row.confidence), 0);
  if (totalWeight <= 0) return 0;
  return rows.reduce((sum, row) => sum + pick(row) * Math.max(0.05, row.confidence), 0) / totalWeight;
}

function aggregateModelBreakdown(responses: ResponseWithNormalizedResult[], entityType: SubjectEntityType): ModelBreakdown[] {
  const groups = new Map<string, { responses: ResponseWithNormalizedResult[] }>();
  for (const response of responses) {
    const modelKey = modelKeyForResponse(response);
    const group = groups.get(modelKey) ?? { responses: [] };
    group.responses.push(response);
    groups.set(modelKey, group);
  }

  return [...groups.entries()].map(([modelKey, group]) => {
    const sampleCount = group.responses.length;
    const first = group.responses[0];
    const entityMetrics = aggregateEntityMetrics(
      group.responses.map((response) => normalizedEntityAccuracy(response)),
      entityType,
      0,
    );
    return {
      modelKey,
      providerId: first.providerId,
      providerName: first.provider?.name ?? null,
      modelId: first.modelId,
      model: first.model,
      platform: first.platform,
      sampleCount,
      mentionRate: sampleCount ? group.responses.filter(targetMentioned).length / sampleCount : 0,
      recommendationShare: sampleCount ? group.responses.filter(targetRecommended).length / sampleCount : 0,
      citationRate: sampleCount ? group.responses.filter(targetCited).length / sampleCount : 0,
      accuracyScore: entityMetrics.accuracyScore,
    };
  }).sort((a, b) => b.sampleCount - a.sampleCount || a.modelKey.localeCompare(b.modelKey));
}

export function modelKeyFromParts(input: { providerId?: string | null; modelId?: string | null; model: string }) {
  return [input.providerId ?? "provider", input.modelId ?? "model", input.model].join(":");
}

function modelKeyForResponse(response: Pick<ResponseWithNormalizedResult, "providerId" | "modelId" | "model">) {
  return modelKeyFromParts(response);
}

function bundleFromSnapshot(snapshot: {
  runId: string;
  sampleCount: number;
  aiVisibilityScore: number | null;
  citationRate: number;
  mentionRate: number;
  recommendationShare: number;
  aiImpressionShare: number | null;
  entityVisibility: number | null;
  semanticCoverage: number | null;
  stabilityIndex: number | null;
  hallucinationRiskScore: number | null;
  competitorGap: number | null;
  descriptionAccuracy: number;
  confidenceMetadata: unknown;
  metadata: unknown;
}): CipMetricBundle {
  const metadata = isRecord(snapshot.metadata) ? snapshot.metadata : {};
  return {
    runId: snapshot.runId,
    sampleCount: snapshot.sampleCount,
    metrics: {
      aiVisibilityScore: snapshot.aiVisibilityScore ?? snapshot.descriptionAccuracy,
      citationRate: snapshot.citationRate,
      mentionRate: snapshot.mentionRate,
      recommendationShare: snapshot.recommendationShare,
      aiImpressionShare: snapshot.aiImpressionShare ?? snapshot.mentionRate,
      entityVisibility: snapshot.entityVisibility ?? 0,
      semanticCoverage: snapshot.semanticCoverage ?? 0,
      stabilityIndex: snapshot.stabilityIndex ?? 0,
      hallucinationRiskScore: snapshot.hallucinationRiskScore ?? 0,
      competitorDelta: snapshot.competitorGap ?? 0,
    },
    entityMetrics: parseEntityMetrics(metadata.entityMetrics, snapshot.descriptionAccuracy),
    modelBreakdown: parseModelBreakdown(metadata.modelBreakdown),
    confidence: isRecord(snapshot.confidenceMetadata) ? snapshot.confidenceMetadata : {},
  };
}

function parseEntityMetrics(value: unknown, fallbackAccuracy: number): EntityMetrics {
  if (!isRecord(value)) {
    return { ...emptyEntityMetrics(), accuracyScore: fallbackAccuracy, factualAccuracy: fallbackAccuracy };
  }
  return {
    factualAccuracy: clamp01(numberOrDefault(value.factualAccuracy, fallbackAccuracy)),
    featureAccuracy: clamp01(numberOrDefault(value.featureAccuracy, fallbackAccuracy)),
    authority: clamp01(numberOrDefault(value.authority, fallbackAccuracy)),
    identityConfusionRisk: clamp01(numberOrDefault(value.identityConfusionRisk, 0)),
    parameterErrorRate: clamp01(numberOrDefault(value.parameterErrorRate, 0)),
    accuracyScore: clamp01(numberOrDefault(value.accuracyScore, fallbackAccuracy)),
  };
}

function parseModelBreakdown(value: unknown): ModelBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = isRecord(item) ? item : {};
    return {
      modelKey: stringOrDefault(row.modelKey, "default"),
      providerId: stringOrNull(row.providerId),
      providerName: stringOrNull(row.providerName),
      modelId: stringOrNull(row.modelId),
      model: stringOrDefault(row.model, "unknown"),
      platform: stringOrDefault(row.platform, "unknown"),
      sampleCount: Math.max(0, Math.round(numberOrDefault(row.sampleCount, 0))),
      mentionRate: clamp01(numberOrDefault(row.mentionRate, 0)),
      recommendationShare: clamp01(numberOrDefault(row.recommendationShare, 0)),
      citationRate: clamp01(numberOrDefault(row.citationRate, 0)),
      accuracyScore: clamp01(numberOrDefault(row.accuracyScore, 0)),
    };
  });
}

async function inferSubjectType(projectId: string, subjectId?: string | null): Promise<SubjectEntityType> {
  const prisma = getPrisma();
  const subject = subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: subjectId }, select: { entityType: true } })
    : await prisma.projectSubject.findFirst({
        where: { projectId, isPrimary: true },
        orderBy: { createdAt: "asc" },
        select: { entityType: true },
      });
  return subject?.entityType ?? "BRAND";
}

function emptyMetrics() {
  return {
    aiVisibilityScore: 0,
    citationRate: 0,
    mentionRate: 0,
    recommendationShare: 0,
    aiImpressionShare: 0,
    entityVisibility: 0,
    semanticCoverage: 0,
    stabilityIndex: 0,
    hallucinationRiskScore: 0,
    competitorDelta: 0,
  };
}

function emptyEntityMetrics(): EntityMetrics {
  return {
    factualAccuracy: 0,
    featureAccuracy: 0,
    authority: 0,
    identityConfusionRisk: 0,
    parameterErrorRate: 0,
    accuracyScore: 0,
  };
}


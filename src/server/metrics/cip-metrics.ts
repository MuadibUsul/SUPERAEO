import { getPrisma } from "@/server/db";
import { stabilityIndex, wilsonInterval } from "@/server/observability/statistics";

export async function buildCipMetricBundle(projectId: string, subjectId?: string | null) {
  const prisma = getPrisma();
  const latestRun = await prisma.samplingRun.findFirst({
    where: { projectId, ...(subjectId ? { subjectId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      responses: {
        include: {
          analysis: true,
          citationSources: true,
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
      confidence: {},
    };
  }

  const responses = latestRun.responses;
  const sampleCount = responses.length;
  const mentioned = responses.filter((response) => targetMentioned(response)).length;
  const recommended = responses.filter((response) => targetRecommended(response)).length;
  const cited = responses.filter((response) => targetCited(response)).length;
  const hallucinationAlerts = await prisma.alert.count({
    where: { projectId, severity: { in: ["P1", "P2"] }, status: "open" },
  });
  const semanticCoverage = await prisma.semanticCoverageSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const entityProfile = await prisma.entityProfile.findFirst({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });

  const mentionRate = sampleCount ? mentioned / sampleCount : 0;
  const citationRate = sampleCount ? cited / sampleCount : 0;
  const recommendationShare = sampleCount ? recommended / sampleCount : 0;
  const entityVisibility = entityProfile?.authorityScore ?? mentionRate;
  const coverage = semanticCoverage?.overallCoverage ?? 0;
  const stability = stabilityIndex(responses.map((response) => targetMentioned(response)));
  const hallucinationRiskScore = Math.min(1, hallucinationAlerts / Math.max(1, sampleCount));
  const aiVisibilityScore =
    0.25 * mentionRate +
    0.2 * citationRate +
    0.2 * recommendationShare +
    0.15 * entityVisibility +
    0.1 * coverage +
    0.1 * stability -
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
    confidence: {
      mentionRate: wilsonInterval(mentioned, sampleCount),
      citationRate: wilsonInterval(cited, sampleCount),
      recommendationShare: wilsonInterval(recommended, sampleCount),
    },
  };
}

type ResponseWithNormalizedResult = {
  analysis: { brandMentioned: boolean; brandRecommended: boolean } | null;
  citationSources: Array<{ supportsBrand: boolean }>;
  probeResults: Array<{ normalizedJson: unknown }>;
};

function targetMentioned(response: ResponseWithNormalizedResult) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetMentioned === "boolean") return normalized.targetMentioned;
  return Boolean(response.analysis?.brandMentioned);
}

function targetRecommended(response: ResponseWithNormalizedResult) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetRecommended === "boolean") return normalized.targetRecommended;
  return Boolean(response.analysis?.brandRecommended);
}

function targetCited(response: ResponseWithNormalizedResult) {
  const normalized = normalizedResult(response);
  const citations = Array.isArray(normalized.citations) ? normalized.citations : [];
  if (citations.some((citation) => isRecord(citation) && citation.supportsTarget === true)) return true;
  return response.citationSources.some((source) => source.supportsBrand);
}

function normalizedResult(response: ResponseWithNormalizedResult) {
  const value = response.probeResults[0]?.normalizedJson;
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

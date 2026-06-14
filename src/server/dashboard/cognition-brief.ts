import type { Locale } from "@/i18n/config";
import { formatBriefTemplate, getCognitionBriefCopy } from "@/i18n/cognition-brief";
import { getPrisma } from "@/server/db";
import { buildCipMetricBundle } from "@/server/metrics/cip-metrics";

type HighlightGroupKey = "positiveTerms" | "riskTerms" | "competitorTerms" | "missingTerms";
type ScoreKey = "recognition" | "semanticClarity" | "trust" | "recommendation" | "risk" | "opportunity";

type MetricBundle = {
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
  confidence: {
    mentionRate?: { estimate: number; lowerBound: number; upperBound: number };
    citationRate?: { estimate: number; lowerBound: number; upperBound: number };
    recommendationShare?: { estimate: number; lowerBound: number; upperBound: number };
  };
};

export type CognitionBriefViewModel = {
  summary: {
    eyebrow: string;
    headline: string;
    subline: string;
    evidenceLevel: string;
  };
  scores: Array<{ key: ScoreKey; label: string; value: number | null }>;
  highlights: Array<{ key: HighlightGroupKey; label: string; items: string[] }>;
  opportunities: Array<{
    id: string;
    title: string;
    subtitle: string;
    priority: string | null;
    score: number | null;
  }>;
  risks: Array<{ id: string; message: string; severity: string | null }>;
  nextActions: string[];
  hasEvidence: boolean;
};

export async function buildCognitionBriefView(input: {
  projectId: string;
  subjectId?: string | null;
  subjectName: string;
  locale: Locale;
}) {
  const prisma = getPrisma();
  const [metrics, latestNebula, latestOpportunity, latestReport, alerts] = await Promise.all([
    buildCipMetricBundle(input.projectId, input.subjectId),
    prisma.semanticNebulaSnapshot.findFirst({
      where: {
        projectId: input.projectId,
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        scope: "OVERALL",
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.longTailOpportunitySnapshot.findFirst({
      where: { projectId: input.projectId, ...(input.subjectId ? { subjectId: input.subjectId } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.report.findFirst({
      where: { projectId: input.projectId, status: "ready" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alert.findMany({
      where: { projectId: input.projectId, status: "open" },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 3,
    }),
  ]);

  return buildCognitionBriefViewModel({
    locale: input.locale,
    subjectName: input.subjectName,
    metrics,
    nebulaSummary: asRecord(latestNebula?.summaryJson),
    opportunitySummary: asRecord(latestOpportunity?.summaryJson),
    opportunityItems: asRecordArray(latestOpportunity?.opportunityJson),
    reportSnapshot: asRecord(latestReport?.snapshot),
    alerts: alerts.map((alert) => ({ title: alert.title, message: alert.message, severity: alert.severity })),
  });
}

export function buildCognitionBriefViewModel(input: {
  locale: Locale;
  subjectName: string;
  metrics: MetricBundle;
  nebulaSummary: Record<string, unknown>;
  opportunitySummary: Record<string, unknown>;
  opportunityItems: Record<string, unknown>[];
  reportSnapshot: Record<string, unknown>;
  alerts: Array<{ title: string; message: string; severity: string }>;
}): CognitionBriefViewModel {
  const copy = getCognitionBriefCopy(input.locale);
  const positiveTerms = uniqueStrings(
    valueAsStringArray(input.nebulaSummary.strongestPositiveTerms).filter(isUsefulTerm),
  ).slice(0, 3);
  const riskTerms = uniqueStrings(
    valueAsStringArray(input.nebulaSummary.strongestNegativeTerms)
      .concat(valueAsStringArray(input.nebulaSummary.riskTerms))
      .filter(isUsefulTerm),
  ).slice(0, 3);
  const competitorTerms = uniqueStrings(
    valueAsStringArray(input.nebulaSummary.competitorOwnedTerms).filter(isUsefulTerm),
  ).slice(0, 3);
  const missingTerms = uniqueStrings(
    valueAsStringArray(input.nebulaSummary.missingTerms).filter(isUsefulTerm),
  ).slice(0, 3);
  const sampleCount = input.metrics.sampleCount;
  const totalTerms = numberOrZero(input.nebulaSummary.totalTerms);
  const opportunityCount =
    numberOrZero(input.opportunitySummary.totalOpportunities) || input.opportunityItems.length;
  const topOpportunity = input.opportunityItems[0] ?? null;
  const summaryFromReport = stringOrEmpty(input.reportSnapshot.cognitionSummary);
  const localizedReportSummary = matchesLocale(summaryFromReport, input.locale) ? summaryFromReport : "";
  const headline =
    sampleCount === 0
      ? formatBriefTemplate(copy.summaryTemplates.empty, { subject: input.subjectName })
      : localizedReportSummary ||
        buildSummaryText(copy.summaryTemplates, input.subjectName, positiveTerms, competitorTerms, riskTerms, topOpportunity);
  const subline =
    sampleCount === 0
      ? copy.pendingSummary
      : formatBriefTemplate(copy.backedBy, {
          samples: sampleCount,
          terms: totalTerms,
          opportunities: opportunityCount,
        });
  const evidenceLevel = sampleCount >= 30 ? copy.evidenceStrong : sampleCount >= 12 ? copy.evidenceGrowing : copy.evidenceEarly;

  const topOpportunityScore = topOpportunity ? numberOrNull(topOpportunity.longTailOccupationPotential) : null;
  const opportunitySummaryScore =
    topOpportunityScore !== null
      ? clamp01(topOpportunityScore / 100)
      : opportunityCount > 0
        ? clamp01(numberOrZero(input.opportunitySummary.highLopOpportunities) / Math.max(1, opportunityCount))
        : null;

  const trustBase =
    input.metrics.sampleCount > 0
      ? averageDefined([
          input.metrics.metrics.citationRate,
          input.metrics.metrics.entityVisibility > 0 ? input.metrics.metrics.entityVisibility : null,
        ])
      : null;
  const clarityBase =
    input.metrics.sampleCount > 0
      ? averageDefined([input.metrics.metrics.semanticCoverage, input.metrics.metrics.stabilityIndex])
      : null;

  const scores: CognitionBriefViewModel["scores"] = [
    { key: "recognition", label: copy.scoreLabels.recognition, value: sampleCount > 0 ? input.metrics.metrics.mentionRate : null },
    { key: "semanticClarity", label: copy.scoreLabels.semanticClarity, value: clarityBase },
    { key: "trust", label: copy.scoreLabels.trust, value: trustBase },
    { key: "recommendation", label: copy.scoreLabels.recommendation, value: sampleCount > 0 ? input.metrics.metrics.recommendationShare : null },
    { key: "risk", label: copy.scoreLabels.risk, value: sampleCount > 0 ? clamp01(1 - input.metrics.metrics.hallucinationRiskScore) : null },
    { key: "opportunity", label: copy.scoreLabels.opportunity, value: opportunitySummaryScore },
  ];

  const highlights: CognitionBriefViewModel["highlights"] = [
    { key: "positiveTerms", label: copy.positiveTerms, items: positiveTerms },
    { key: "riskTerms", label: copy.riskTerms, items: riskTerms },
    { key: "competitorTerms", label: copy.competitorTerms, items: competitorTerms },
    { key: "missingTerms", label: copy.missingTerms, items: missingTerms },
  ];

  const opportunities = input.opportunityItems.slice(0, 3).map((item, index) => {
    const title = stringOrEmpty(item.question) || stringOrEmpty(item.opportunityTitle) || `Opportunity ${index + 1}`;
    const scenario = stringOrEmpty(item.scenario) || stringOrEmpty(item.intent) || copy.topOpportunities;
    const score = numberOrNull(item.longTailOccupationPotential);
    return {
      id: stringOrEmpty(item.id) || `${index}`,
      title,
      subtitle: formatBriefTemplate(copy.opportunityReason, { score: score ?? "-", scenario }),
      priority: stringOrNull(item.priority),
      score,
    };
  });

  const risks =
    input.alerts.length > 0
      ? input.alerts.map((alert, index) => ({
          id: `alert-${index}`,
          severity: alert.severity,
          message: formatBriefTemplate(copy.riskMessages.alert, {
            title: alert.title,
            message: alert.message,
          }),
        }))
      : riskTerms.slice(0, 3).map((term, index) => ({
          id: `term-${index}`,
          severity: null,
          message: formatBriefTemplate(copy.riskMessages.term, { term }),
        }));

  const nextActions = buildNextActions(copy.actionTemplates, {
    topOpportunity,
    firstMissingTerm: missingTerms[0] ?? null,
    firstCompetitorTerm: competitorTerms[0] ?? null,
    firstRiskTerm: riskTerms[0] ?? null,
  });

  return {
    summary: {
      eyebrow: copy.eyebrow,
      headline,
      subline,
      evidenceLevel,
    },
    scores,
    highlights,
    opportunities,
    risks,
    nextActions,
    hasEvidence: sampleCount > 0,
  };
}

function buildSummaryText(
  templates: ReturnType<typeof getCognitionBriefCopy>["summaryTemplates"],
  subjectName: string,
  positiveTerms: string[],
  competitorTerms: string[],
  riskTerms: string[],
  topOpportunity: Record<string, unknown> | null,
) {
  const positive = positiveTerms[0] ?? subjectName;
  const weakness = competitorTerms[0] ?? riskTerms[0] ?? positiveTerms[1] ?? subjectName;
  const opportunity =
    (topOpportunity && (stringOrEmpty(topOpportunity.scenario) || stringOrEmpty(topOpportunity.questionCluster))) ||
    positiveTerms[2] ||
    subjectName;

  return formatBriefTemplate(positiveTerms.length > 0 ? templates.rich : templates.basic, {
    subject: subjectName,
    positive,
    weakness,
    opportunity,
  });
}

function buildNextActions(
  templates: ReturnType<typeof getCognitionBriefCopy>["actionTemplates"],
  input: {
    topOpportunity: Record<string, unknown> | null;
    firstMissingTerm: string | null;
    firstCompetitorTerm: string | null;
    firstRiskTerm: string | null;
  },
) {
  const actions: string[] = [];
  const scenario =
    input.topOpportunity && (stringOrEmpty(input.topOpportunity.scenario) || stringOrEmpty(input.topOpportunity.questionCluster));
  if (scenario) {
    actions.push(formatBriefTemplate(templates.opportunity, { scenario }));
  }
  if (input.firstMissingTerm) {
    actions.push(formatBriefTemplate(templates.missing, { term: input.firstMissingTerm }));
  }
  if (input.firstCompetitorTerm) {
    actions.push(formatBriefTemplate(templates.competitor, { term: input.firstCompetitorTerm }));
  } else if (input.firstRiskTerm) {
    actions.push(formatBriefTemplate(templates.risk, { term: input.firstRiskTerm }));
  }
  while (actions.length < 3) {
    actions.push(templates.generic);
  }
  return uniqueStrings(actions).slice(0, 3);
}

function averageDefined(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function valueAsStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringOrEmpty).filter(Boolean) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value: unknown) {
  const normalized = stringOrEmpty(value);
  return normalized || null;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isUsefulTerm(term: string) {
  const normalized = term.trim();
  return normalized.length >= 3 && !/^(if you|risks?|musk)$/i.test(normalized);
}

function matchesLocale(value: string, locale: Locale) {
  if (!value) return false;
  const hasChinese = /[\u4e00-\u9fff]/u.test(value);
  return locale === "zh-CN" ? hasChinese : !hasChinese;
}

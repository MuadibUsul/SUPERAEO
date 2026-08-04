import type { Prisma } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";
import { buildCognitionBriefViewModel } from "@/server/dashboard/cognition-brief";
import { computeVisibilityOutcomeCorrelation, DEFAULT_OUTCOME_METRIC, listExperimentSummaries } from "@/server/analysis/proof-service";
import { getCognitionTrend } from "@/server/analysis/trend-service";
import { getPrisma } from "@/server/db";
import { getEntityProfile } from "@/server/entity/entity-profiles";
import { getLatestCipMetricBundle } from "@/server/metrics/cip-metrics";
import { asRecord, asRecordArray } from "@/server/utils/coerce";

const snapshotVersion = "2026-06-21.a-layer.v1";

export async function buildReportSnapshot(input: {
  projectId: string;
  subjectId?: string | null;
  subjectName: string;
}) {
  const prisma = getPrisma();
  const [metrics, latestNebula, opportunitySnapshot, questionTerritory, experiments, correlation, responses, alerts, subject, trendZh, trendEn] =
    await Promise.all([
      getLatestCipMetricBundle(input.projectId, input.subjectId),
      prisma.semanticNebulaSnapshot.findFirst({
        where: { projectId: input.projectId, ...(input.subjectId ? { subjectId: input.subjectId } : {}), scope: "OVERALL" },
        orderBy: { createdAt: "desc" },
        select: { id: true, scope: true, nodeJson: true, summaryJson: true, createdAt: true },
      }),
      prisma.longTailOpportunitySnapshot.findFirst({
        where: { projectId: input.projectId, ...(input.subjectId ? { subjectId: input.subjectId } : {}) },
        orderBy: { createdAt: "desc" },
      }),
      prisma.questionTerritorySnapshot.findFirst({
        where: { projectId: input.projectId, ...(input.subjectId ? { subjectId: input.subjectId } : {}) },
        orderBy: { createdAt: "desc" },
      }),
      listExperimentSummaries(input.projectId),
      computeVisibilityOutcomeCorrelation(input.projectId, DEFAULT_OUTCOME_METRIC),
      prisma.aIResponse.findMany({
        where: { run: { projectId: input.projectId, ...(input.subjectId ? { subjectId: input.subjectId } : {}) } },
        include: { query: true, provider: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.alert.findMany({
        where: { projectId: input.projectId, status: "open" },
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
        take: 12,
      }),
      input.subjectId
        ? prisma.projectSubject.findUnique({ where: { id: input.subjectId } })
        : prisma.projectSubject.findFirst({ where: { projectId: input.projectId, isPrimary: true }, orderBy: { createdAt: "asc" } }),
      getCognitionTrend({ projectId: input.projectId, subjectId: input.subjectId, locale: "zh-CN" }),
      getCognitionTrend({ projectId: input.projectId, subjectId: input.subjectId, locale: "en" }),
    ]);

  const opportunityItems = asRecordArray(opportunitySnapshot?.opportunityJson);
  const nebulaSummary = asRecord(latestNebula?.summaryJson);
  const opportunitySummary = asRecord(opportunitySnapshot?.summaryJson);
  const trendByLocale = { "zh-CN": trendZh, en: trendEn };
  const briefs = {
    "zh-CN": buildCognitionBriefViewModel({
      locale: "zh-CN",
      subjectName: input.subjectName,
      metrics,
      nebulaSummary,
      opportunitySummary,
      opportunityItems,
      reportSnapshot: {},
      alerts: alerts.map((alert) => ({ title: alert.title, message: alert.message, severity: alert.severity })),
    }),
    en: buildCognitionBriefViewModel({
      locale: "en",
      subjectName: input.subjectName,
      metrics,
      nebulaSummary,
      opportunitySummary,
      opportunityItems,
      reportSnapshot: {},
      alerts: alerts.map((alert) => ({ title: alert.title, message: alert.message, severity: alert.severity })),
    }),
  };

  return toJsonValue({
    version: snapshotVersion,
    generatedAt: new Date().toISOString(),
    projectId: input.projectId,
    subject: subject
      ? {
          id: subject.id,
          entityType: subject.entityType,
          displayName: subject.displayName,
          canonicalName: subject.canonicalName,
          websiteUrl: subject.websiteUrl,
          market: subject.market,
          language: subject.language,
        }
      : null,
    subjectName: input.subjectName,
    entityProfile: getEntityProfile(subject?.entityType),
    metrics,
    briefs,
    semanticNebula: latestNebula
      ? {
          id: latestNebula.id,
          scope: latestNebula.scope,
          nodeJson: latestNebula.nodeJson,
          summaryJson: latestNebula.summaryJson,
          createdAt: latestNebula.createdAt.toISOString(),
        }
      : null,
    opportunities: opportunitySnapshot
      ? {
          id: opportunitySnapshot.id,
          opportunityJson: opportunitySnapshot.opportunityJson,
          summaryJson: opportunitySnapshot.summaryJson,
          createdAt: opportunitySnapshot.createdAt.toISOString(),
        }
      : null,
    questionTerritory: questionTerritory
      ? {
          id: questionTerritory.id,
          territoryJson: questionTerritory.territoryJson,
          summaryJson: questionTerritory.summaryJson,
          createdAt: questionTerritory.createdAt.toISOString(),
        }
      : null,
    experiments,
    correlation,
    trendByLocale,
    responses: responses.map((response) => ({
      id: response.id,
      queryText: response.query.queryText,
      providerName: response.provider?.name ?? response.platform,
      platform: response.platform,
      model: response.model,
      normalizedAnswer: response.normalizedAnswer,
      rawResponse: response.rawResponse,
      createdAt: response.createdAt.toISOString(),
    })),
  });
}

export function getSnapshotBrief(snapshot: unknown, locale: Locale) {
  const record = asRecord(snapshot);
  const briefs = asRecord(record.briefs);
  return asRecord(briefs[locale]);
}

export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}


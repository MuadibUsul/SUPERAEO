import type { Prisma, SubjectEntityType } from "@/generated/prisma/client";

import { calculateExplorationMetrics, coverageGaps, evaluateSaturation, type ExplorationIterationMetrics } from "@/server/analysis/semantic-exploration-metrics";
import { getPrisma } from "@/server/db";
import { legacyTermDomain, semanticDomains, type SemanticDomain } from "@/server/semantic-nebula/ontology";
import { applyProbeOccurrenceCounts, clusterSemanticUnits } from "@/server/semantic-nebula/semantic-clustering";
import { buildSemanticUnit, type SemanticUnit } from "@/server/semantic-nebula/semantic-unit";

export async function createSemanticCoverageSnapshot(projectId: string) {
  const prisma = getPrisma();
  const [project, keywords, queries, responses, nebula, previousSnapshot] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, include: { subjects: { orderBy: { createdAt: "asc" } } } }),
    prisma.semanticKeyword.findMany({ where: { projectId } }),
    prisma.aeoQuery.findMany({ where: { projectId } }),
    prisma.aIResponse.findMany({ where: { run: { projectId } }, include: { analysis: true }, orderBy: { createdAt: "asc" } }),
    prisma.semanticNebulaSnapshot.findFirst({ where: { projectId, scope: "OVERALL" }, orderBy: { createdAt: "desc" } }),
    prisma.semanticCoverageSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!project) throw new Error("Project not found.");
  const subject = project.subjects.find((item) => item.isPrimary) ?? project.subjects[0];
  const subjectId = subject?.id ?? `legacy:${projectId}`;
  const entityType: SubjectEntityType = subject?.entityType ?? "BRAND";

  const matchedKeywords = new Set<string>();
  for (const response of responses) {
    const values = response.analysis?.matchedKeywords;
    if (Array.isArray(values)) for (const value of values) if (typeof value === "string") matchedKeywords.add(value.toLowerCase());
  }

  const units = unitsFromNebula(nebula?.nodeJson, { projectId, subjectId, subjectName: subject?.displayName ?? project.brandName });
  if (units.length === 0) {
    for (const keyword of keywords) {
      const mapped = keywordDomain(keyword.keywordType);
      units.push(buildSemanticUnit({ domain: mapped.domain, type: mapped.type, canonicalLabel: keyword.keyword, surfaceForm: keyword.keyword, confidence: matchedKeywords.has(keyword.keyword.toLowerCase()) ? 0.8 : 0.4 }, {
        projectId, subjectId, runId: "legacy-sampling", probeId: `keyword:${keyword.id}`, model: "aggregate", iteration: 0, semanticDepth: 0,
      }));
    }
  }

  const clustered = clusterSemanticUnits({ units });
  applyProbeOccurrenceCounts(clustered.clusters, units, clustered.assignments);
  const nodeCounts = nodeProbeCounts(nebula?.nodeJson, units);
  for (const cluster of clustered.clusters) cluster.probeOccurrenceCount = Math.max(cluster.probeOccurrenceCount, ...cluster.memberIds.map((id) => nodeCounts.get(id) ?? 0));

  const previousHistory = snapshotHistory(previousSnapshot?.evidence);
  const iteration = (previousHistory.at(-1)?.iteration ?? 0) + 1;
  const metrics = calculateExplorationMetrics({ iteration, totalProbes: queries.length, units, clusters: clustered.clusters, previous: previousHistory.at(-1), entityType });
  const history = [...previousHistory, metrics].slice(-24);
  const saturation = evaluateSaturation(history);
  const gaps = coverageGaps(metrics);
  const keywordCount = Math.max(1, keywords.length);
  const queryTypes = new Set(queries.map((query) => query.queryType));
  const missingConcepts = keywords.filter((keyword) => !matchedKeywords.has(keyword.keyword.toLowerCase())).slice(0, 12).map((keyword) => ({ keyword: keyword.keyword, keywordType: keyword.keywordType, targetWeight: keyword.targetWeight }));

  return prisma.semanticCoverageSnapshot.create({
    data: {
      projectId,
      topicBreadth: Object.values(metrics.domains).filter((domain) => domain.unitCount > 0).length / semanticDomains.length,
      topicDepth: responses.length ? Math.min(1, responses.length / Math.max(1, queries.length * 2)) : 0,
      intentCoverage: Math.min(1, queryTypes.size / 8),
      vocabularyDiversity: Math.min(1, new Set(keywords.map((keyword) => keyword.keyword.split(" ")[0]?.toLowerCase())).size / keywordCount),
      overallCoverage: metrics.estimatedCoverage,
      missingConcepts: [...gaps, ...missingConcepts].slice(0, 16) as unknown as Prisma.InputJsonValue,
      competitorGaps: gaps.filter((gap) => gap.domain === "ENTITY" || gap.domain === "RELATION") as unknown as Prisma.InputJsonValue,
      evidence: {
        schemaVersion: 2,
        subjectId,
        overall: { observedCoverage: metrics.observedCoverage, estimatedCoverage: metrics.estimatedCoverage, saturationScore: metrics.saturationScore },
        exploration: { status: saturation.saturated ? "SATURATED" : "OBSERVING", iterations: iteration, totalProbes: queries.length, stopReason: saturation.saturated ? "SEMANTIC_SATURATION" : null, rolling: saturation.rolling, underexploredCriticalDomains: saturation.underexploredCriticalDomains },
        semantic: { uniqueTerms: metrics.uniqueTerms, semanticUnits: metrics.semanticUnits, clusters: metrics.semanticClusters, relationTypes: metrics.relationTypes },
        novelty: metrics.novelty,
        estimate: { observedClusters: metrics.observedClusters, estimatedClusters: metrics.estimatedClusters },
        domains: metrics.domains,
        gaps,
        history,
        legacy: { keywordCount: keywords.length, queryCount: queries.length, responseCount: responses.length },
      } as unknown as Prisma.InputJsonValue,
    },
  });
}

function unitsFromNebula(value: unknown, context: { projectId: string; subjectId: string; subjectName: string }) {
  if (!Array.isArray(value)) return [] as SemanticUnit[];
  return value.flatMap((item, index) => {
    const node = asRecord(item);
    const term = stringValue(node.term);
    if (!term) return [];
    const meta = asRecord(node.semanticMeta);
    const fallback = legacyTermDomain(stringValue(node.termType) || "OTHER");
    const domain = semanticDomains.includes(meta.domain as SemanticDomain) ? meta.domain as SemanticDomain : fallback.domain;
    const examples = Array.isArray(node.examples) ? node.examples.map(asRecord) : [];
    return [buildSemanticUnit({ domain, type: stringValue(meta.type) || fallback.type, canonicalLabel: term, surfaceForm: term, subject: context.subjectName, confidence: numberValue(meta.confidence, numberValue(node.evidenceConfidence, 50) / 100) }, {
      projectId: context.projectId,
      subjectId: context.subjectId,
      runId: stringValue(examples[0]?.runId) || "semantic-nebula",
      probeId: stringValue(examples[0]?.queryId) || `nebula:${index}`,
      responseId: stringValue(examples[0]?.responseId) || undefined,
      providerId: stringValue(examples[0]?.provider) || undefined,
      model: stringValue(examples[0]?.model) || "aggregate",
      iteration: numberValue(meta.firstSeenIteration, 0),
      semanticDepth: 0,
    })];
  });
}

function nodeProbeCounts(value: unknown, units: SemanticUnit[]) {
  const counts = new Map<string, number>();
  if (!Array.isArray(value)) return counts;
  value.forEach((item, index) => {
    const node = asRecord(item);
    const unit = units[index];
    if (unit) counts.set(unit.id, numberValue(asRecord(node.semanticMeta).probeOccurrenceCount, numberValue(node.promptCount, 1)));
  });
  return counts;
}

function keywordDomain(keywordType: string) {
  if (keywordType === "scenario" || keywordType === "intent") return { domain: "CONTEXT" as const, type: keywordType === "scenario" ? "SCENARIO" : "CONDITION" };
  if (keywordType === "competitor") return { domain: "ENTITY" as const, type: "COMPANY" };
  if (keywordType === "risk") return { domain: "RISK_OPPORTUNITY" as const, type: "RISK" };
  return { domain: "ATTRIBUTE" as const, type: keywordType === "category" ? "CATEGORY" : "PROPERTY" };
}

function snapshotHistory(value: unknown): ExplorationIterationMetrics[] {
  const history = asRecord(value).history;
  return Array.isArray(history) ? history.filter((item): item is ExplorationIterationMetrics => Boolean(item && typeof item === "object" && "iteration" in item)) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

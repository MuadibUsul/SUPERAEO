import { ontologyProfile, semanticDomains, type SemanticDomain } from "@/server/semantic-nebula/ontology";
import type { SemanticCluster } from "@/server/semantic-nebula/semantic-clustering";
import type { SemanticUnit } from "@/server/semantic-nebula/semantic-unit";
import type { SubjectEntityType } from "@/generated/prisma/client";

export type NoveltyMetrics = {
  vocabulary: number;
  unit: number;
  cluster: number;
  relation: number;
  domain: number;
};

export type DomainCoverageMetrics = {
  domain: SemanticDomain;
  unitCount: number;
  clusterCount: number;
  relationCount: number;
  recentNovelty: number;
  observedCoverage: number;
  estimatedCoverage: number;
  saturationScore: number;
};

export type ExplorationIterationMetrics = {
  iteration: number;
  totalProbes: number;
  rawTerms: number;
  uniqueTerms: number;
  semanticUnits: number;
  semanticClusters: number;
  relationTypes: number;
  novelty: NoveltyMetrics;
  observedClusters: number;
  estimatedClusters: number;
  observedCoverage: number;
  estimatedCoverage: number;
  saturationScore: number;
  domains: Record<SemanticDomain, DomainCoverageMetrics>;
};

export type SaturationConfig = {
  minIterations: number;
  rollingWindow: number;
  clusterThreshold: number;
  relationThreshold: number;
  unitThreshold: number;
  domainThreshold: number;
  estimatedCoverageThreshold: number;
  criticalDomainCoverageThreshold: number;
  criticalDomains: SemanticDomain[];
};

export const defaultSaturationConfig: SaturationConfig = {
  minIterations: 5,
  rollingWindow: 5,
  clusterThreshold: 0.005,
  relationThreshold: 0.002,
  unitThreshold: 0.005,
  domainThreshold: 0.002,
  estimatedCoverageThreshold: 0.985,
  criticalDomainCoverageThreshold: 0.8,
  criticalDomains: ["ENTITY", "RELATION", "FUNCTION", "CAUSE_EFFECT", "EVALUATION", "RISK_OPPORTUNITY"],
};

export function estimateChao1(probeOccurrences: number[]) {
  const observedClusters = probeOccurrences.length;
  if (observedClusters === 0) return { observedClusters: 0, estimatedClusters: 0, f1: 0, f2: 0, estimatedCoverage: 0 };
  const f1 = probeOccurrences.filter((count) => count === 1).length;
  const f2 = probeOccurrences.filter((count) => count === 2).length;
  const unseen = f2 > 0 ? (f1 * f1) / (2 * f2) : (f1 * Math.max(0, f1 - 1)) / 2;
  const estimatedClusters = Math.max(observedClusters, observedClusters + unseen);
  return { observedClusters, estimatedClusters, f1, f2, estimatedCoverage: clamp01(observedClusters / estimatedClusters) };
}

export function calculateExplorationMetrics(input: {
  iteration: number;
  totalProbes: number;
  units: SemanticUnit[];
  clusters: SemanticCluster[];
  previous?: ExplorationIterationMetrics;
  entityType: SubjectEntityType;
}): ExplorationIterationMetrics {
  const labels = new Set(input.units.map((unit) => unit.canonicalLabel));
  const relationTypes = new Set(input.units.map((unit) => unit.predicate).filter((value): value is string => Boolean(value)));
  const domainsSeen = new Set(input.units.map((unit) => unit.domain));
  const estimate = estimateChao1(input.clusters.map((cluster) => cluster.probeOccurrenceCount));
  const novelty: NoveltyMetrics = {
    vocabulary: calculateNovelty(labels.size, input.previous?.uniqueTerms ?? 0),
    unit: calculateNovelty(input.units.length, input.previous?.semanticUnits ?? 0),
    cluster: calculateNovelty(input.clusters.length, input.previous?.semanticClusters ?? 0),
    relation: calculateNovelty(relationTypes.size, input.previous?.relationTypes ?? 0),
    domain: calculateNovelty(domainsSeen.size, input.previous ? Object.values(input.previous.domains).filter((domain) => domain.unitCount > 0).length : 0),
  };
  const domains = Object.fromEntries(semanticDomains.map((domain) => {
    const units = input.units.filter((unit) => unit.domain === domain);
    const clusters = input.clusters.filter((cluster) => cluster.domain === domain);
    const domainEstimate = estimateChao1(clusters.map((cluster) => cluster.probeOccurrenceCount));
    const previous = input.previous?.domains[domain];
    const recentNovelty = calculateNovelty(clusters.length, previous?.clusterCount ?? 0);
    const estimatedCoverage = domainEstimate.estimatedCoverage;
    return [domain, {
      domain,
      unitCount: units.length,
      clusterCount: clusters.length,
      relationCount: new Set(units.map((unit) => unit.predicate).filter(Boolean)).size,
      recentNovelty,
      observedCoverage: clusters.length > 0 ? 1 : 0,
      estimatedCoverage,
      saturationScore: clamp01(0.7 * estimatedCoverage + 0.3 * (1 - recentNovelty)),
    } satisfies DomainCoverageMetrics];
  })) as Record<SemanticDomain, DomainCoverageMetrics>;

  const weights = ontologyProfile(input.entityType);
  const weightTotal = semanticDomains.reduce((total, domain) => total + weights[domain], 0);
  const weightedObserved = semanticDomains.reduce((total, domain) => total + domains[domain].observedCoverage * weights[domain], 0) / weightTotal;
  const weightedCoverage = semanticDomains.reduce((total, domain) => total + domains[domain].estimatedCoverage * weights[domain], 0) / weightTotal;
  const saturationScore = clamp01(0.65 * weightedCoverage + 0.35 * (1 - average(Object.values(novelty))));
  return {
    iteration: input.iteration,
    totalProbes: input.totalProbes,
    rawTerms: input.units.length,
    uniqueTerms: labels.size,
    semanticUnits: input.units.length,
    semanticClusters: input.clusters.length,
    relationTypes: relationTypes.size,
    novelty,
    observedClusters: estimate.observedClusters,
    estimatedClusters: estimate.estimatedClusters,
    observedCoverage: clamp01(weightedObserved),
    estimatedCoverage: clamp01(weightedCoverage),
    saturationScore,
    domains,
  };
}

export function evaluateSaturation(history: ExplorationIterationMetrics[], overrides: Partial<SaturationConfig> = {}) {
  const config = { ...defaultSaturationConfig, ...overrides };
  const latest = history.at(-1);
  if (!latest) return { saturated: false, rolling: emptyNovelty(), underexploredCriticalDomains: [...config.criticalDomains], reason: "NO_EVIDENCE" } as const;
  const window = history.slice(-config.rollingWindow);
  const rolling = {
    vocabulary: average(window.map((item) => item.novelty.vocabulary)),
    unit: average(window.map((item) => item.novelty.unit)),
    cluster: average(window.map((item) => item.novelty.cluster)),
    relation: average(window.map((item) => item.novelty.relation)),
    domain: average(window.map((item) => item.novelty.domain)),
  };
  const underexploredCriticalDomains = config.criticalDomains.filter((domain) => latest.domains[domain].estimatedCoverage < config.criticalDomainCoverageThreshold);
  const saturated = latest.iteration >= config.minIterations && window.length >= config.rollingWindow && rolling.cluster < config.clusterThreshold && rolling.relation < config.relationThreshold && rolling.unit < config.unitThreshold && rolling.domain < config.domainThreshold && latest.estimatedCoverage >= config.estimatedCoverageThreshold && underexploredCriticalDomains.length === 0;
  return { saturated, rolling, underexploredCriticalDomains, reason: saturated ? "SEMANTIC_SATURATION" : "CONTINUE" } as const;
}

export function coverageGaps(metrics: ExplorationIterationMetrics, limit = 8) {
  return Object.values(metrics.domains)
    .sort((left, right) => left.estimatedCoverage - right.estimatedCoverage || right.recentNovelty - left.recentNovelty)
    .slice(0, limit)
    .map((domain) => ({ domain: domain.domain, coverage: domain.estimatedCoverage, recentNovelty: domain.recentNovelty, priority: (1 - domain.estimatedCoverage) * (1 + domain.recentNovelty) }));
}

function calculateNovelty(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 1 : 0;
  return Math.max(0, current - previous) / previous;
}

function emptyNovelty(): NoveltyMetrics {
  return { vocabulary: 0, unit: 0, cluster: 0, relation: 0, domain: 0 };
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

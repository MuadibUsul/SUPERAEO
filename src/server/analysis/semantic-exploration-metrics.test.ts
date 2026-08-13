import assert from "node:assert/strict";
import test from "node:test";

import { defaultSaturationConfig, estimateChao1, evaluateSaturation, type ExplorationIterationMetrics } from "@/server/analysis/semantic-exploration-metrics";
import { semanticDomains } from "@/server/semantic-nebula/ontology";

test("Chao1 handles no clusters, one cluster, f1/f2, and f2=0", () => {
  assert.deepEqual(estimateChao1([]), { observedClusters: 0, estimatedClusters: 0, f1: 0, f2: 0, estimatedCoverage: 0 });
  assert.equal(estimateChao1([1]).estimatedClusters, 1);
  assert.equal(estimateChao1([1, 1, 2]).estimatedClusters, 5);
  assert.equal(estimateChao1([1, 1, 1]).estimatedClusters, 6);
  assert.ok(Number.isFinite(estimateChao1([1, 1, 1]).estimatedCoverage));
});

test("domain-aware saturation does not stop when CAUSE_EFFECT remains low", () => {
  const history = Array.from({ length: 5 }, (_, index) => metrics(index + 1, 0));
  const result = evaluateSaturation(history, { ...defaultSaturationConfig, minIterations: 5 });
  assert.equal(result.saturated, false);
  assert.ok(result.underexploredCriticalDomains.includes("CAUSE_EFFECT"));
});

test("rolling low novelty plus covered critical domains reaches saturation", () => {
  const history = Array.from({ length: 5 }, (_, index) => metrics(index + 1, 1));
  const result = evaluateSaturation(history, { ...defaultSaturationConfig, minIterations: 5 });
  assert.equal(result.saturated, true);
  assert.equal(result.reason, "SEMANTIC_SATURATION");
});

function metrics(iteration: number, causeCoverage: number): ExplorationIterationMetrics {
  const domains = Object.fromEntries(semanticDomains.map((domain) => [domain, { domain, unitCount: 3, clusterCount: 2, relationCount: 1, recentNovelty: 0, observedCoverage: 1, estimatedCoverage: domain === "CAUSE_EFFECT" ? causeCoverage : 1, saturationScore: 1 }])) as ExplorationIterationMetrics["domains"];
  return { iteration, totalProbes: iteration * 10, rawTerms: 30, uniqueTerms: 20, semanticUnits: 25, semanticClusters: 20, relationTypes: 8, novelty: { vocabulary: 0, unit: 0, cluster: 0, relation: 0, domain: 0 }, observedClusters: 20, estimatedClusters: 20, observedCoverage: 1, estimatedCoverage: 1, saturationScore: 1, domains };
}

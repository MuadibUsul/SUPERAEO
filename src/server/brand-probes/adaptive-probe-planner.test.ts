import assert from "node:assert/strict";
import test from "node:test";

import { fallbackProbeSimilarity, generateAdaptiveProbeCandidates } from "@/server/brand-probes/adaptive-probe-planner";
import type { ExplorationIterationMetrics } from "@/server/analysis/semantic-exploration-metrics";
import { semanticDomains } from "@/server/semantic-nebula/ontology";

test("semantic duplicate fallback catches competitor paraphrases", () => {
  const similarity = fallbackProbeSimilarity("Who are NVIDIA's main competitors?", "Which companies compete most directly with NVIDIA?");
  assert.ok(similarity >= 0.9, String(similarity));
});

test("adaptive candidates target low-coverage domains and carry semantic intent", () => {
  const metrics = coverageMetrics();
  const candidates = generateAdaptiveProbeCandidates({ subjectName: "NVIDIA", language: "en", metrics, iteration: 2 });
  assert.equal(candidates[0].intent.targetDomain, "CAUSE_EFFECT");
  assert.equal(candidates[0].variables.generationMode, "adaptive");
  assert.match(candidates[0].prompt, /semantic_units/);
});

function coverageMetrics(): ExplorationIterationMetrics {
  const domains = Object.fromEntries(semanticDomains.map((domain) => [domain, { domain, unitCount: 5, clusterCount: 5, relationCount: 2, recentNovelty: 0, observedCoverage: 1, estimatedCoverage: domain === "CAUSE_EFFECT" ? 0.1 : 0.9, saturationScore: 0.9 }])) as ExplorationIterationMetrics["domains"];
  return { iteration: 1, totalProbes: 20, rawTerms: 30, uniqueTerms: 20, semanticUnits: 25, semanticClusters: 20, relationTypes: 8, novelty: { vocabulary: 0.1, unit: 0.1, cluster: 0.1, relation: 0, domain: 0 }, observedClusters: 20, estimatedClusters: 24, observedCoverage: 1, estimatedCoverage: 0.85, saturationScore: 0.8, domains };
}

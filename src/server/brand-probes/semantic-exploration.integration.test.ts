import assert from "node:assert/strict";
import test from "node:test";

import { calculateExplorationMetrics } from "@/server/analysis/semantic-exploration-metrics";
import { generateAdaptiveProbeCandidates } from "@/server/brand-probes/adaptive-probe-planner";
import { applyProbeOccurrenceCounts, clusterSemanticUnits } from "@/server/semantic-nebula/semantic-clustering";
import { extractProbeSemanticUnits } from "@/server/semantic-nebula/semantic-unit";

test("seed response -> units -> clusters -> coverage gap -> adaptive probe -> second coverage", () => {
  const seedUnits = extractProbeSemanticUnits({
    projectId: "project", subjectId: "subject", runId: "run", probeId: "seed", responseId: "response-1", model: "model-a", zone: "core_semantics", iteration: 1,
    data: { semantic_units: [{ domain: "ENTITY", type: "ORGANIZATION", canonicalLabel: "TSMC", surfaceForm: "TSMC", predicate: "SUPPLIER_OF", confidence: 0.9 }] },
  });
  const firstClusters = clusterSemanticUnits({ units: seedUnits });
  applyProbeOccurrenceCounts(firstClusters.clusters, seedUnits, firstClusters.assignments);
  const first = calculateExplorationMetrics({ iteration: 1, totalProbes: 1, units: seedUnits, clusters: firstClusters.clusters, entityType: "BRAND" });
  const [adaptive] = generateAdaptiveProbeCandidates({ subjectName: "NVIDIA", language: "en", metrics: first, iteration: 2 });
  assert.notEqual(adaptive.intent.targetDomain, "ENTITY");

  const secondUnits = extractProbeSemanticUnits({
    projectId: "project", subjectId: "subject", runId: "run", probeId: "adaptive", responseId: "response-2", model: "model-a", zone: adaptive.zone, iteration: 2,
    data: { semantic_units: [{ domain: adaptive.intent.targetDomain, type: adaptive.intent.targetType ?? "CONCEPT", canonicalLabel: "new evidence", surfaceForm: "new evidence", confidence: 0.8 }] },
  });
  const allUnits = [...seedUnits, ...secondUnits];
  const secondClusters = clusterSemanticUnits({ units: allUnits });
  applyProbeOccurrenceCounts(secondClusters.clusters, allUnits, secondClusters.assignments);
  const second = calculateExplorationMetrics({ iteration: 2, totalProbes: 2, units: allUnits, clusters: secondClusters.clusters, previous: first, entityType: "BRAND" });
  assert.ok(second.domains[adaptive.intent.targetDomain].unitCount > first.domains[adaptive.intent.targetDomain].unitCount);
  assert.ok(second.semanticClusters > first.semanticClusters);
});

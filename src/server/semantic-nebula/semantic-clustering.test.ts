import assert from "node:assert/strict";
import test from "node:test";

import { applyProbeOccurrenceCounts, clusterSemanticUnits } from "@/server/semantic-nebula/semantic-clustering";
import { buildSemanticUnit } from "@/server/semantic-nebula/semantic-unit";

function unit(label: string, probeId: string) {
  return buildSemanticUnit({ domain: "ENTITY", type: "CONCEPT", canonicalLabel: label, surfaceForm: label }, { projectId: "p", subjectId: "s", probeId, responseId: `r-${probeId}`, runId: "run", model: `m-${probeId}` });
}

test("AI, Artificial Intelligence, and 人工智能 enter one cluster", () => {
  const units = [unit("AI", "p1"), unit("Artificial Intelligence", "p2"), unit("人工智能", "p3")];
  const result = clusterSemanticUnits({ units });
  applyProbeOccurrenceCounts(result.clusters, units, result.assignments);
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].probeOccurrenceCount, 3);
});

test("AI and Antitrust Regulation do not merge", () => {
  const units = [unit("AI", "p1"), unit("Antitrust Regulation", "p2")];
  const result = clusterSemanticUnits({ units });
  assert.equal(result.clusters.length, 2);
});

test("incremental centroid uses the running mean", () => {
  const units = [unit("AI", "p1"), unit("Artificial Intelligence", "p2")];
  const result = clusterSemanticUnits({ units, vectors: { [units[0].id]: [1, 0], [units[1].id]: [0.9, 0.1] }, clusterThreshold: 0.8 });
  assert.deepEqual(result.clusters[0].centroid.map((value) => Number(value.toFixed(2))), [0.95, 0.05]);
});

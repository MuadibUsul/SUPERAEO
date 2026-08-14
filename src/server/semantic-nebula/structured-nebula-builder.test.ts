import assert from "node:assert/strict";
import test from "node:test";

import { applyProbeOccurrenceCounts, clusterSemanticUnits } from "@/server/semantic-nebula/semantic-clustering";
import { buildStructuredSemanticNebula } from "@/server/semantic-nebula/structured-nebula-builder";
import { extractProbeSemanticUnits } from "@/server/semantic-nebula/semantic-unit";

test("structured units and predicates become traceable nebula nodes and relation edges", () => {
  const units = extractProbeSemanticUnits({
    projectId: "project",
    subjectId: "subject",
    runId: "probe-run",
    probeId: "probe-1",
    responseId: "response-1",
    providerId: "provider-1",
    model: "model-a",
    iteration: 2,
    semanticDepth: 1,
    zone: "competition",
    data: {
      semantic_units: [
        {
          domain: "RELATION",
          type: "SUPPLY_RELATION",
          canonicalLabel: "advanced chip supply",
          surfaceForm: "advanced chip supply",
          subject: "NVIDIA",
          predicate: "SUPPLIER_OF",
          object: "TSMC",
          confidence: 0.94,
        },
        {
          domain: "RISK_OPPORTUNITY",
          type: "RISK",
          canonicalLabel: "not available offline",
          surfaceForm: "not available offline",
          predicate: "AVAILABLE_IN",
          negated: true,
          polarity: "negative",
          confidence: 0.88,
        },
      ],
    },
  });
  const clustered = clusterSemanticUnits({ units });
  applyProbeOccurrenceCounts(clustered.clusters, units, clustered.assignments);

  const graph = buildStructuredSemanticNebula({
    subjectName: "NVIDIA",
    entityType: "BRAND",
    scope: "OVERALL",
    iteration: 2,
    units,
    clusters: clustered.clusters,
    evidenceByResponseId: new Map([["response-1", {
      prompt: "Who supplies advanced chips, and what is unavailable?",
      rawResponse: "TSMC supplies advanced chips; offline availability is absent.",
      provider: "OpenAI",
      model: "model-a",
      createdAt: new Date("2026-08-14T00:00:00.000Z"),
    }]]),
  });

  assert.equal(graph.nodes.length, 2);
  assert.ok(graph.nodes.every((node) => node.semanticMeta?.clusterId === node.id));
  assert.ok(graph.edges.some((edge) => edge.semanticMeta?.canonicalRelation === "SUPPLIES"));
  assert.ok(graph.edges.some((edge) => edge.semanticMeta?.canonicalRelation === "AVAILABLE_IN" && edge.semanticMeta.negated === true));
  assert.ok(graph.nodes.every((node) => node.examples[0]?.responseId === "response-1"));
});

test("keeps every collected semantic cluster in the overall nebula", () => {
  const units = Array.from({ length: 240 }, (_, index) => extractProbeSemanticUnits({
    projectId: "project",
    subjectId: "subject",
    runId: "probe-run",
    probeId: `probe-${index}`,
    responseId: `response-${index}`,
    model: "model-a",
    zone: "core_semantics",
    data: { semantic_units: [{ domain: "ATTRIBUTE", type: "PROPERTY", canonicalLabel: `concept-${index}`, confidence: 0.7 }] },
  })[0]);
  const vectors = Object.fromEntries(units.map((unit, index) => [unit.id, Array.from({ length: units.length }, (_, dimension) => index === dimension ? 1 : 0)]));
  const clustered = clusterSemanticUnits({ units, vectors });
  applyProbeOccurrenceCounts(clustered.clusters, units, clustered.assignments);

  const graph = buildStructuredSemanticNebula({
    subjectName: "Subject",
    entityType: "BRAND",
    scope: "OVERALL",
    iteration: 1,
    units,
    clusters: clustered.clusters,
  });

  assert.equal(clustered.clusters.length, 240);
  assert.equal(graph.nodes.length, 240);
});

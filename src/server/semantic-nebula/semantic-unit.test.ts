import assert from "node:assert/strict";
import test from "node:test";

import { canonicalizeRelation, canonicalizeSemanticLabel } from "@/server/semantic-nebula/ontology";
import { extractProbeSemanticUnits } from "@/server/semantic-nebula/semantic-unit";

test("canonicalizes multilingual concepts and relation aliases", () => {
  assert.equal(canonicalizeSemanticLabel("AI"), "artificial intelligence");
  assert.equal(canonicalizeSemanticLabel("人工智能"), "artificial intelligence");
  assert.equal(canonicalizeRelation("RIVALS"), "COMPETES_WITH");
  assert.equal(canonicalizeRelation("COMPETITOR_OF"), "COMPETES_WITH");
});

test("preserves negation, uncertainty, condition, temporal, and quantity modifiers", () => {
  const [unit] = extractProbeSemanticUnits({
    projectId: "project-1",
    subjectId: "subject-1",
    runId: "run-1",
    probeId: "probe-1",
    responseId: "response-1",
    model: "model-a",
    iteration: 2,
    semanticDepth: 1,
    zone: "core_semantics",
    data: {
      semantic_units: [{
        domain: "ACTION",
        type: "PRODUCES",
        canonicalLabel: "manufactures wafers",
        surfaceForm: "NVIDIA may not manufacture wafers in Taiwan",
        subject: "NVIDIA",
        predicate: "MANUFACTURES",
        object: "wafers",
        negated: true,
        uncertainty: "possible",
        confidence: 0.7,
        intensity: 0.4,
        condition: "in Taiwan",
        temporal: { from: "2026", label: "forecast" },
        value: 12,
        unit: "months",
      }],
    },
  });
  assert.equal(unit.predicate, "PRODUCES");
  assert.equal(unit.negated, true);
  assert.equal(unit.uncertainty, "possible");
  assert.equal(unit.condition, "in Taiwan");
  assert.deepEqual(unit.temporal, { from: "2026", label: "forecast" });
  assert.equal(unit.value, 12);
  assert.equal(unit.unit, "months");
  assert.equal(unit.source.responseId, "response-1");
});

test("a probe premise is not a discovery until a response supplies a semantic unit", () => {
  const units = extractProbeSemanticUnits({
    projectId: "project-1", subjectId: "subject-1", runId: "run-1", probeId: "probe-1", responseId: "response-1", model: "model-a", zone: "competition",
    data: { keywords: [], competitors: [], scenarios: [], audiences: [], risk_words: [], opportunity_words: [], recommended_entities: [] },
  });
  assert.deepEqual(units, []);
});

test("word fields remain audit evidence alongside structured semantic units", () => {
  const units = extractProbeSemanticUnits({
    projectId: "project-1", subjectId: "subject-1", runId: "run-1", probeId: "probe-1", responseId: "response-1", model: "model-a", zone: "core_semantics",
    data: {
      semantic_units: [{ domain: "ATTRIBUTE", type: "CAPABILITY", canonicalLabel: "AI acceleration", confidence: 0.9 }],
      keywords: ["AI acceleration", "CUDA ecosystem"],
      scenarios: ["model training"],
    },
  });

  assert.equal(units.filter((unit) => unit.canonicalLabel === "ai acceleration").length, 1);
  assert.ok(units.some((unit) => unit.canonicalLabel === "cuda ecosystem"));
  assert.ok(units.some((unit) => unit.canonicalLabel === "model training" && unit.domain === "CONTEXT"));
});

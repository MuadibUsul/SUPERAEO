import assert from "node:assert/strict";
import test from "node:test";

import { calculateSemanticGravity } from "@/server/semantic-nebula/semantic-gravity";
import type { SemanticTermCandidate } from "@/server/semantic-nebula/types";

test("semantic gravity combines frequency, stability, co-mention, recommendation, and evidence confidence", () => {
  const candidate: SemanticTermCandidate = {
    term: "low sugar",
    normalizedTerm: "low sugar",
    termType: "BENEFIT",
    polarity: "POSITIVE",
    occurrences: 6,
    responseIds: new Set(["r1", "r2", "r3"]),
    queryIds: new Set(["q1", "q2", "q3"]),
    runIds: new Set(["run1"]),
    modelIds: new Set(["m1", "m2"]),
    promptKeys: new Set(["recommendation", "comparison"]),
    scenarios: new Set(["office", "fitness"]),
    personas: new Set(["buyer", "marketer"]),
    probeFamilies: new Set(["recommendation_probability", "competitor_distance"]),
    recommendationHits: 4,
    competitorContextHits: 0,
    riskContextHits: 0,
    subjectCoMentionScores: [1, 0.75, 0.45],
    evidence: [
      { excerpt: "low sugar option", contextFlags: ["recommendation"] },
      { excerpt: "low sugar alternative", contextFlags: ["recommendation"] },
    ],
  };

  const result = calculateSemanticGravity({
    candidate,
    totalResponses: 6,
    totalScenarios: 3,
    totalPersonas: 2,
    totalProbeFamilies: 4,
  });

  assert.equal(result.components.sentimentWeight, 90);
  assert.ok(result.semanticGravity > 50);
  assert.ok(result.components.recommendationContextWeight > 50);
});


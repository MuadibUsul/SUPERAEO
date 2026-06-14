import assert from "node:assert/strict";
import test from "node:test";

import { buildQuestionTerritoryMap } from "@/server/opportunity/question-territory-builder";
import type { LongTailOpportunity } from "@/server/opportunity/types";

test("builds question territory winner and summary counts", () => {
  const opportunity: LongTailOpportunity = {
    id: "opp-1",
    opportunityTitle: "Small SaaS tools",
    opportunityType: "QUESTION_CLUSTER",
    question: "Which AI visibility tool should a small SaaS use?",
    questionCluster: "Small SaaS tools",
    scenario: "Small SaaS",
    persona: "founder",
    intent: "RECOMMENDATION",
    entityFitScore: 88,
    competitorWeaknessScore: 82,
    answerInclusionPotential: 84,
    contentFeasibilityScore: 90,
    conversionValueScore: 80,
    longTailOccupationPotential: 86,
    components: {
      intentStrength: 90,
      entityFit: 88,
      competitorWeakness: 82,
      answerInclusionPotential: 84,
      contentFeasibility: 90,
      conversionValue: 80,
    },
    difficulty: "LOW",
    priority: "P0",
    recommendedContentAssets: [],
    evidence: [{ excerpt: "CIP appears as a fit.", competitors: [], reasons: ["AI visibility"] }],
    occupiedByCompetitors: [],
    missingEvidence: [],
    suggestedProbeQueries: [],
  };

  const result = buildQuestionTerritoryMap({ opportunities: [opportunity], targetName: "CIP" });
  assert.equal(result.summary.highOpportunity, 1);
  assert.equal(result.territory[0].winnerType, "TARGET");
});


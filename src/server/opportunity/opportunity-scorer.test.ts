import assert from "node:assert/strict";
import test from "node:test";

import { scoreLongTailOpportunity } from "@/server/opportunity/opportunity-scorer";

test("scores high-fit low-competition recommendation questions as strong opportunities", () => {
  const result = scoreLongTailOpportunity({
    candidate: {
      question: "What AI visibility tool should a small SaaS use?",
      clusterName: "Small SaaS AI visibility",
      scenario: "Small SaaS diagnosis",
      persona: "founder",
      intent: "RECOMMENDATION",
      opportunityType: "QUESTION_CLUSTER",
      naturalnessScore: 90,
      specificityScore: 86,
      commercialValueScore: 82,
    },
    subjectTerms: ["AI visibility", "small SaaS"],
    positiveNebulaTerms: ["AI visibility"],
    competitorDominance: 0.2,
    targetMentionRate: 0.1,
    hasSpecificRecommendations: true,
    occupiedByCompetitors: [],
    evidence: [{ excerpt: "No clear winner" }],
  });

  assert.ok(result.longTailOccupationPotential >= 70);
  assert.equal(result.difficulty, "LOW");
});

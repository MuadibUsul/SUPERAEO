import type { LongTailOpportunity, QuestionTerritoryItem } from "@/server/opportunity/types";

export const questionTerritoryVersion = "2026-09-11.v2-candidate-validation";

export function buildQuestionTerritoryMap(input: {
  opportunities: LongTailOpportunity[];
}) {
  const territory: QuestionTerritoryItem[] = input.opportunities.map((opportunity) => {
    // Generated candidate questions have not been asked verbatim in a sampling run.
    // Project-level evidence may inform their predicted score, but cannot establish ownership.
    const competitorDominance = Math.max(0, Math.min(1, 1 - opportunity.competitorWeaknessScore / 100));

    return {
      question: opportunity.question,
      cluster: opportunity.questionCluster,
      scenario: opportunity.scenario,
      intent: opportunity.intent,
      winnerType: "UNKNOWN" as const,
      targetMentioned: false,
      targetRecommended: false,
      topCompetitors: [],
      answerInclusionRate: 0,
      recommendationSlotRate: 0,
      topNPresenceRate: 0,
      competitorDominance: Number(competitorDominance.toFixed(2)),
      noClearWinnerRate: 0,
      reasonOwnership: [],
      opportunityScore: opportunity.longTailOccupationPotential,
      difficulty: opportunity.difficulty,
      priority: opportunity.priority,
      evidence: [],
      validationStatus: "UNVALIDATED" as const,
      supportingSampleCount: 0,
      entityFitScore: opportunity.entityFitScore,
      competitorWeaknessScore: opportunity.competitorWeaknessScore,
      answerInclusionPotential: opportunity.answerInclusionPotential,
      contentFeasibilityScore: opportunity.contentFeasibilityScore,
      conversionValueScore: opportunity.conversionValueScore,
      recommendedContentAssets: opportunity.recommendedContentAssets,
      missingEvidence: opportunity.missingEvidence,
      suggestedProbeQueries: opportunity.suggestedProbeQueries,
    };
  });

  return {
    territory,
    summary: summarizeTerritory(territory),
  };
}

function summarizeTerritory(territory: QuestionTerritoryItem[]) {
  return {
    totalQuestions: territory.length,
    targetOwned: territory.filter((item) => item.winnerType === "TARGET").length,
    competitorOwned: territory.filter((item) => item.winnerType === "COMPETITOR").length,
    noClearWinner: territory.filter((item) => item.winnerType === "NO_CLEAR_WINNER").length,
    awaitingValidation: territory.filter((item) => item.validationStatus !== "VALIDATED").length,
    highOpportunity: territory.filter((item) => item.priority === "P0" || item.priority === "P1").length,
    lowValue: territory.filter((item) => item.opportunityScore < 52).length,
    topClusters: Array.from(new Set(territory.sort((a, b) => b.opportunityScore - a.opportunityScore).map((item) => item.cluster))).slice(0, 6),
  };
}

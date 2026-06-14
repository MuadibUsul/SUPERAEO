import type { LongTailOpportunity, QuestionTerritoryItem } from "@/server/opportunity/types";

export function buildQuestionTerritoryMap(input: {
  opportunities: LongTailOpportunity[];
  targetName: string;
}) {
  const territory: QuestionTerritoryItem[] = input.opportunities.map((opportunity) => {
    const topCompetitors = opportunity.occupiedByCompetitors.slice(0, 5);
    const targetMentioned = opportunity.evidence.some((item) => item.excerpt.toLowerCase().includes(input.targetName.toLowerCase()));
    const targetRecommended = targetMentioned && opportunity.answerInclusionPotential >= 70;
    const competitorDominance = Math.max(0, Math.min(1, 1 - opportunity.competitorWeaknessScore / 100));
    const noClearWinnerRate = topCompetitors.length === 0 ? 0.78 : Math.max(0, 1 - competitorDominance);

    return {
      question: opportunity.question,
      cluster: opportunity.questionCluster,
      scenario: opportunity.scenario,
      intent: opportunity.intent,
      winnerType: targetRecommended
        ? "TARGET"
        : competitorDominance >= 0.68
          ? "COMPETITOR"
          : noClearWinnerRate >= 0.55
            ? "NO_CLEAR_WINNER"
            : "GENERIC",
      targetMentioned,
      targetRecommended,
      topCompetitors,
      answerInclusionRate: targetMentioned ? 0.35 : 0,
      recommendationSlotRate: targetRecommended ? 0.18 : 0,
      topNPresenceRate: targetRecommended ? 0.14 : 0,
      competitorDominance: Number(competitorDominance.toFixed(2)),
      noClearWinnerRate: Number(noClearWinnerRate.toFixed(2)),
      reasonOwnership: opportunity.evidence.flatMap((item) => item.reasons ?? []).slice(0, 6),
      opportunityScore: opportunity.longTailOccupationPotential,
      difficulty: opportunity.difficulty,
      priority: opportunity.priority,
      evidence: opportunity.evidence,
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
    highOpportunity: territory.filter((item) => item.priority === "P0" || item.priority === "P1").length,
    lowValue: territory.filter((item) => item.opportunityScore < 52).length,
    topClusters: Array.from(new Set(territory.sort((a, b) => b.opportunityScore - a.opportunityScore).map((item) => item.cluster))).slice(0, 6),
  };
}


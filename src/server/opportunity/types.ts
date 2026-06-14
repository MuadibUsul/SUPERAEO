export const opportunityVersion = "2026-05-19.v1";

export const opportunityTypes = [
  "MICRO_INTENT",
  "SCENARIO",
  "AUDIENCE_SEGMENT",
  "PAIN_POINT",
  "COMPARISON",
  "ALTERNATIVE_TO_BIG_BRAND",
  "USE_CASE",
  "TRUST_GAP",
  "CONTENT_GAP",
  "QUESTION_CLUSTER",
] as const;

export type OpportunityType = (typeof opportunityTypes)[number];

export const opportunityIntents = [
  "INFORMATIONAL",
  "COMMERCIAL",
  "TRANSACTIONAL",
  "NAVIGATIONAL",
  "COMPARISON",
  "PROBLEM_SOLVING",
  "RECOMMENDATION",
] as const;

export type OpportunityIntent = (typeof opportunityIntents)[number];

export type OpportunityDifficulty = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type OpportunityPriority = "P0" | "P1" | "P2" | "P3";

export type OpportunityScoreComponents = {
  intentStrength: number;
  entityFit: number;
  competitorWeakness: number;
  answerInclusionPotential: number;
  contentFeasibility: number;
  conversionValue: number;
};

export type LongTailOpportunity = {
  id: string;
  opportunityTitle: string;
  opportunityType: OpportunityType;
  question: string;
  questionCluster: string;
  scenario: string;
  persona: string;
  intent: OpportunityIntent;
  entityFitScore: number;
  competitorWeaknessScore: number;
  answerInclusionPotential: number;
  contentFeasibilityScore: number;
  conversionValueScore: number;
  longTailOccupationPotential: number;
  components: OpportunityScoreComponents;
  difficulty: OpportunityDifficulty;
  priority: OpportunityPriority;
  recommendedContentAssets: string[];
  evidence: OpportunityEvidence[];
  occupiedByCompetitors: string[];
  missingEvidence: string[];
  suggestedProbeQueries: string[];
};

export type OpportunityEvidence = {
  queryId?: string | null;
  responseId?: string | null;
  excerpt: string;
  competitors?: string[];
  reasons?: string[];
};

export type OpportunityCandidateQuestion = {
  question: string;
  clusterName: string;
  scenario: string;
  persona: string;
  intent: OpportunityIntent;
  opportunityType: OpportunityType;
  naturalnessScore: number;
  specificityScore: number;
  commercialValueScore: number;
};

export type QuestionTerritoryItem = {
  question: string;
  cluster: string;
  scenario: string;
  intent: OpportunityIntent;
  winnerType: "TARGET" | "COMPETITOR" | "NO_CLEAR_WINNER" | "GENERIC" | "UNKNOWN";
  targetMentioned: boolean;
  targetRecommended: boolean;
  topCompetitors: string[];
  answerInclusionRate: number;
  recommendationSlotRate: number;
  topNPresenceRate: number;
  competitorDominance: number;
  noClearWinnerRate: number;
  reasonOwnership: string[];
  opportunityScore: number;
  difficulty: OpportunityDifficulty;
  priority: OpportunityPriority;
  evidence: OpportunityEvidence[];
};


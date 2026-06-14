import type {
  LongTailOpportunity,
  OpportunityCandidateQuestion,
  OpportunityDifficulty,
  OpportunityPriority,
  OpportunityScoreComponents,
} from "@/server/opportunity/types";
import { normalizeTerm } from "@/server/semantic-nebula/term-normalizer";

export const defaultLopWeights = {
  intentStrength: 0.2,
  entityFit: 0.2,
  competitorWeakness: 0.2,
  answerInclusionPotential: 0.15,
  contentFeasibility: 0.15,
  conversionValue: 0.1,
} as const;

export function scoreLongTailOpportunity(input: {
  candidate: OpportunityCandidateQuestion;
  subjectTerms: string[];
  positiveNebulaTerms: string[];
  competitorDominance: number;
  targetMentionRate: number;
  hasSpecificRecommendations: boolean;
  occupiedByCompetitors: string[];
  evidence: LongTailOpportunity["evidence"];
}) {
  const components: OpportunityScoreComponents = {
    intentStrength: clampScore(
      0.45 * input.candidate.naturalnessScore +
        0.25 * input.candidate.specificityScore +
        0.3 * intentBaseScore(input.candidate.intent),
    ),
    entityFit: calculateEntityFit(input.candidate.question, [...input.subjectTerms, ...input.positiveNebulaTerms]),
    competitorWeakness: clampScore(100 - input.competitorDominance * 100),
    answerInclusionPotential: clampScore(
      (input.hasSpecificRecommendations ? 72 : 42) +
        (["RECOMMENDATION", "COMPARISON", "COMMERCIAL"].includes(input.candidate.intent) ? 18 : 0) +
        input.targetMentionRate * 10,
    ),
    contentFeasibility: contentFeasibilityScore(input.candidate.question),
    conversionValue: clampScore(input.candidate.commercialValueScore),
  };
  const longTailOccupationPotential = clampScore(
    Object.entries(defaultLopWeights).reduce((total, [key, weight]) => {
      return total + components[key as keyof OpportunityScoreComponents] * weight;
    }, 0),
  );

  return {
    components,
    longTailOccupationPotential,
    difficulty: difficultyFromScore(components.competitorWeakness, components.contentFeasibility),
    priority: priorityFromScore(longTailOccupationPotential),
  };
}

export function buildContentAssets(question: string, scenario: string) {
  return [
    `FAQ: ${question}`,
    `Guide: ${scenario}`,
    `Evidence section: why this entity is relevant for ${scenario}`,
  ];
}

function calculateEntityFit(question: string, terms: string[]) {
  const normalizedQuestion = normalizeTerm(question);
  const normalizedTerms = terms.map(normalizeTerm).filter(Boolean);
  const matches = normalizedTerms.filter((term) => normalizedQuestion.includes(term) || term.includes(normalizedQuestion));
  const lexicalScore = Math.min(1, matches.length / Math.max(2, normalizedTerms.length * 0.2));
  return clampScore(48 + lexicalScore * 42 + (normalizedQuestion.length > 12 ? 10 : 0));
}

function intentBaseScore(intent: string) {
  switch (intent) {
    case "TRANSACTIONAL":
      return 92;
    case "RECOMMENDATION":
      return 90;
    case "COMMERCIAL":
      return 84;
    case "COMPARISON":
      return 82;
    case "PROBLEM_SOLVING":
      return 78;
    case "INFORMATIONAL":
      return 58;
    default:
      return 45;
  }
}

function contentFeasibilityScore(question: string) {
  const normalized = normalizeTerm(question);
  const contentFriendly = ["how", "what", "which", "best", "compare", "guide", "怎么办", "适合", "推荐", "哪些"].some((term) =>
    normalized.includes(term),
  );
  return contentFriendly ? 88 : 72;
}

function difficultyFromScore(competitorWeakness: number, contentFeasibility: number): OpportunityDifficulty {
  if (competitorWeakness >= 78 && contentFeasibility >= 80) return "LOW";
  if (competitorWeakness >= 58) return "MEDIUM";
  if (competitorWeakness >= 38) return "HIGH";
  return "VERY_HIGH";
}

function priorityFromScore(score: number): OpportunityPriority {
  if (score >= 82) return "P0";
  if (score >= 68) return "P1";
  if (score >= 52) return "P2";
  return "P3";
}

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}


import type {
  SemanticGravityComponents,
  SemanticGravityWeights,
  SemanticTermCandidate,
} from "@/server/semantic-nebula/types";

export const defaultSemanticGravityWeights: SemanticGravityWeights = {
  frequencyScore: 0.25,
  scenarioStabilityScore: 0.2,
  coMentionStrength: 0.15,
  sentimentWeight: 0.15,
  recommendationContextWeight: 0.15,
  evidenceConfidence: 0.1,
};

export function calculateSemanticGravity(input: {
  candidate: SemanticTermCandidate;
  totalResponses: number;
  totalScenarios: number;
  totalPersonas: number;
  totalProbeFamilies: number;
  weights?: SemanticGravityWeights;
}) {
  const components = calculateSemanticGravityComponents(input);
  const weights = input.weights ?? defaultSemanticGravityWeights;
  const semanticGravity = Object.entries(weights).reduce((total, [key, weight]) => {
    return total + components[key as keyof SemanticGravityWeights] * weight;
  }, 0);

  return {
    semanticGravity: clampScore(semanticGravity),
    components,
  };
}

export function calculateSemanticGravityComponents(input: {
  candidate: SemanticTermCandidate;
  totalResponses: number;
  totalScenarios: number;
  totalPersonas: number;
  totalProbeFamilies: number;
}): SemanticGravityComponents {
  const candidate = input.candidate;
  const totalResponses = Math.max(1, input.totalResponses);
  const responseCoverage = candidate.responseIds.size / totalResponses;
  const frequencyScore = clampScore((0.65 * responseCoverage + 0.35 * Math.min(1, candidate.occurrences / totalResponses)) * 100);

  const scenarioCoverage = candidate.scenarios.size / Math.max(1, input.totalScenarios);
  const personaCoverage = candidate.personas.size / Math.max(1, input.totalPersonas);
  const probeCoverage = candidate.probeFamilies.size / Math.max(1, input.totalProbeFamilies);
  const scenarioStabilityScore = clampScore((0.45 * scenarioCoverage + 0.25 * personaCoverage + 0.3 * probeCoverage) * 100);

  const coMentionStrength = candidate.subjectCoMentionScores.length
    ? clampScore((candidate.subjectCoMentionScores.reduce((total, value) => total + value, 0) / candidate.subjectCoMentionScores.length) * 100)
    : 0;

  const sentimentWeight = polarityScore(candidate.polarity);
  const recommendationContextWeight = clampScore(
    ((candidate.recommendationHits / Math.max(1, candidate.occurrences)) * 0.8 +
      (candidate.probeFamilies.has("recommendation_probability") ? 0.2 : 0)) *
      100,
  );
  const evidenceConfidence = clampScore(
    (0.35 * Math.min(1, candidate.evidence.length / 6) +
      0.2 * Math.min(1, candidate.modelIds.size / 3) +
      0.2 * Math.min(1, candidate.queryIds.size / 5) +
      0.15 * Math.min(1, candidate.runIds.size / 2) +
      0.1 * Math.min(1, candidate.promptKeys.size / 4)) *
      100,
  );

  return {
    frequencyScore,
    scenarioStabilityScore,
    coMentionStrength,
    sentimentWeight,
    recommendationContextWeight,
    evidenceConfidence,
  };
}

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function polarityScore(polarity: SemanticTermCandidate["polarity"]) {
  switch (polarity) {
    case "POSITIVE":
      return 90;
    case "NEGATIVE":
      return 85;
    case "MIXED":
      return 70;
    case "NEUTRAL":
      return 55;
    default:
      return 40;
  }
}


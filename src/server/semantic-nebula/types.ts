import type { SubjectEntityType } from "@/generated/prisma/client";

export const semanticNebulaVersion = "2026-06-08.v2";

export const nebulaScopes = [
  "OVERALL",
  "POSITIVE_NEGATIVE",
  "SCENARIO",
  "COMPETITOR",
  "MISSING",
  "RISK",
] as const;

export type NebulaScope = (typeof nebulaScopes)[number];

export const semanticTermTypes = [
  "DESCRIPTIVE",
  "POSITIVE",
  "NEGATIVE",
  "SCENARIO",
  "AUDIENCE",
  "COMPETITOR",
  "BENEFIT",
  "RISK",
  "TRUST",
  "FUNCTIONAL",
  "CATEGORY",
  "INCORRECT",
  "DESIRED",
  "UNDESIRED",
  "MISSING",
  "OTHER",
] as const;

export type SemanticTermType = (typeof semanticTermTypes)[number];

export const semanticPolarities = ["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED", "UNKNOWN"] as const;

export type SemanticPolarity = (typeof semanticPolarities)[number];

export type SemanticGravityWeights = {
  frequencyScore: number;
  scenarioStabilityScore: number;
  coMentionStrength: number;
  sentimentWeight: number;
  recommendationContextWeight: number;
  evidenceConfidence: number;
};

export type SemanticGravityComponents = Record<keyof SemanticGravityWeights, number>;

export type SemanticEvidenceItem = {
  queryId?: string | null;
  responseId?: string | null;
  runId?: string | null;
  question?: string | null;
  excerpt: string;
  probeFamily?: string | null;
  queryType?: string | null;
  scenario?: string | null;
  persona?: string | null;
  provider?: string | null;
  model?: string | null;
  createdAt?: string | null;
  contextFlags: string[];
};

export type SemanticTermCandidate = {
  term: string;
  normalizedTerm: string;
  termType: SemanticTermType;
  polarity: SemanticPolarity;
  occurrences: number;
  responseIds: Set<string>;
  queryIds: Set<string>;
  runIds: Set<string>;
  modelIds: Set<string>;
  promptKeys: Set<string>;
  scenarios: Set<string>;
  personas: Set<string>;
  probeFamilies: Set<string>;
  recommendationHits: number;
  competitorContextHits: number;
  riskContextHits: number;
  subjectCoMentionScores: number[];
  evidence: SemanticEvidenceItem[];
  firstSeenAt?: Date;
  lastSeenAt?: Date;
};

export type SemanticNebulaNode = {
  id: string;
  term: string;
  normalizedTerm: string;
  termType: SemanticTermType;
  polarity: SemanticPolarity;
  semanticGravity: number;
  proximityScore: number;
  frequencyScore: number;
  stabilityScore: number;
  coMentionStrength: number;
  recommendationContextWeight: number;
  evidenceConfidence: number;
  sourceCount: number;
  promptCount: number;
  modelCount: number;
  models: string[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  components: SemanticGravityComponents;
  examples: SemanticEvidenceItem[];
  context: {
    competitorContext: boolean;
    riskContext: boolean;
    missingDesired: boolean;
  };
};

export type SemanticNebulaEdge = {
  id: string;
  source: string;
  target: string;
  edgeType: "subject_term" | "term_term" | "competitor_context" | "risk_context" | "missing_context";
  weight: number;
  confidence: number;
  evidenceCount: number;
};

export type SemanticNebulaSummary = {
  scope: NebulaScope;
  version: string;
  entityType: SubjectEntityType;
  subjectName: string;
  totalTerms: number;
  positiveGravity: number;
  negativeGravity: number;
  missingDesiredTerms: number;
  competitorGravity: number;
  incorrectAssociationRisk: number;
  strongestPositiveTerms: string[];
  strongestNegativeTerms: string[];
  competitorOwnedTerms: string[];
  missingTerms: string[];
  riskTerms: string[];
};

export type SemanticNebulaBuildResult = {
  scope: NebulaScope;
  nodes: SemanticNebulaNode[];
  edges: SemanticNebulaEdge[];
  summary: SemanticNebulaSummary;
  evidence: Record<string, SemanticEvidenceItem[]>;
};

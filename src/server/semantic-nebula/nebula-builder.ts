import type { Prisma, SubjectEntityType } from "@/generated/prisma/client";
import { getNebulaScopeDefinition } from "@/server/semantic-nebula/nebula-registry";
import { calculateSemanticGravity } from "@/server/semantic-nebula/semantic-gravity";
import { extractSemanticTermCandidates } from "@/server/semantic-nebula/semantic-term-extractor";
import { legacyTermDomain } from "@/server/semantic-nebula/ontology";
import {
  type NebulaScope,
  type SemanticNebulaBuildResult,
  type SemanticNebulaEdge,
  type SemanticNebulaNode,
  semanticNebulaMaxNodes,
  semanticNebulaNodePolicy,
  semanticNebulaVersion,
} from "@/server/semantic-nebula/types";

type BuildInput = {
  subject: {
    id: string;
    entityType: SubjectEntityType;
    displayName: string;
    canonicalName: string;
    profileJson: Prisma.JsonValue | null;
  };
  competitors: { name: string }[];
  keywords: { keyword: string; keywordType: string; targetWeight: number }[];
  responses: Parameters<typeof extractSemanticTermCandidates>[0]["responses"];
};

export function buildSemanticNebula(input: BuildInput, scope: NebulaScope): SemanticNebulaBuildResult {
  const profile = asRecord(input.subject.profileJson);
  const desiredTerms = collectTerms([
    profile.targetAssociations,
    profile.desiredAssociations,
    profile.desired_associations,
    profile.targetKeywords,
    profile.benefits,
    input.keywords.filter((keyword) => keyword.targetWeight >= 0.8).map((keyword) => keyword.keyword),
  ]);
  const undesiredTerms = collectTerms([
    profile.undesiredAssociations,
    profile.undesired_associations,
    profile.risks,
  ]);
  const aliases = collectTerms([profile.aliases, profile.alias, input.subject.canonicalName]);
  const competitors = input.competitors.map((competitor) => competitor.name);
  const candidates = extractSemanticTermCandidates({
    subjectName: input.subject.displayName,
    subjectAliases: aliases,
    competitors,
    desiredTerms,
    undesiredTerms,
    keywords: input.keywords,
    responses: input.responses,
  });

  const totalResponses = Math.max(1, input.responses.length);
  const totalScenarios = new Set(input.responses.map((response) => response.query.intent ?? response.query.queryType)).size || 1;
  const totalPersonas = new Set(input.responses.map((response) => response.query.personaType ?? response.query.persona ?? response.persona ?? "unknown")).size || 1;
  const totalProbeFamilies = new Set(input.responses.map((response) => response.query.queryType)).size || 1;

  const allNodes = candidates
    .map((candidate) => {
      const gravity = calculateSemanticGravity({
        candidate,
        totalResponses,
        totalScenarios,
        totalPersonas,
        totalProbeFamilies,
      });
      const node: SemanticNebulaNode = {
        id: candidate.normalizedTerm,
        term: candidate.term,
        normalizedTerm: candidate.normalizedTerm,
        termType: candidate.termType,
        polarity: candidate.polarity,
        semanticGravity: gravity.semanticGravity,
        proximityScore: gravity.components.coMentionStrength,
        frequencyScore: gravity.components.frequencyScore,
        stabilityScore: gravity.components.scenarioStabilityScore,
        coMentionStrength: gravity.components.coMentionStrength,
        recommendationContextWeight: gravity.components.recommendationContextWeight,
        evidenceConfidence: gravity.components.evidenceConfidence,
        sourceCount: candidate.responseIds.size,
        promptCount: candidate.queryIds.size,
        modelCount: candidate.modelIds.size,
        models: Array.from(new Set(candidate.evidence.map((item) => item.model).filter((model): model is string => Boolean(model)))),
        firstSeenAt: candidate.firstSeenAt?.toISOString() ?? null,
        lastSeenAt: candidate.lastSeenAt?.toISOString() ?? null,
        components: gravity.components,
        examples: candidate.evidence.slice(0, 5),
        context: {
          competitorContext: candidate.competitorContextHits > 0 || candidate.termType === "COMPETITOR",
          riskContext: candidate.riskContextHits > 0 || ["RISK", "INCORRECT", "UNDESIRED"].includes(candidate.termType),
          missingDesired: candidate.termType === "MISSING",
        },
        semanticMeta: {
          ...legacyTermDomain(candidate.termType),
          clusterId: `legacy:${candidate.normalizedTerm}`,
          firstSeenIteration: 0,
          probeOccurrenceCount: candidate.queryIds.size,
          noveltyScore: 0,
          confidence: Number((gravity.components.evidenceConfidence / 100).toFixed(3)),
          crossModelOccurrenceCount: candidate.modelIds.size,
        },
      };
      return node;
    })
    .sort((a, b) => b.semanticGravity - a.semanticGravity);

  const scopeDefinition = getNebulaScopeDefinition(scope);
  const nodes = allNodes.filter(scopeDefinition.filter).slice(0, semanticNebulaMaxNodes);
  const edges = buildEdges(input.subject.displayName, nodes);
  const evidence = Object.fromEntries(nodes.map((node) => [node.normalizedTerm, node.examples]));
  const summary = buildSummary({
    scope,
    entityType: input.subject.entityType,
    subjectName: input.subject.displayName,
    nodes,
  });

  return { scope, nodes, edges, summary, evidence };
}

function buildEdges(subjectName: string, nodes: SemanticNebulaNode[]): SemanticNebulaEdge[] {
  const subjectId = `subject:${subjectName}`;
  return nodes.map((node) => {
    const edgeType = node.context.missingDesired
      ? "missing_context"
      : node.context.riskContext
        ? "risk_context"
        : node.context.competitorContext
          ? "competitor_context"
          : "subject_term";
    const canonicalRelation = edgeType === "competitor_context" ? "COMPETES_WITH" : edgeType === "risk_context" ? "ASSOCIATED_WITH" : edgeType === "missing_context" ? "MISSING_ASSOCIATION" : "ASSOCIATED_WITH";
    const confidence = Number((node.evidenceConfidence / 100).toFixed(3));
    return {
      id: `${subjectId}->${node.normalizedTerm}`,
      source: subjectId,
      target: node.normalizedTerm,
      edgeType,
      weight: Number((node.semanticGravity / 100).toFixed(3)),
      confidence,
      evidenceCount: node.sourceCount,
      semanticMeta: { canonicalRelation, relationDomain: node.semanticMeta?.domain ?? "RELATION", confidence, negated: false },
    };
  });
}

function buildSummary(input: {
  scope: NebulaScope;
  entityType: SubjectEntityType;
  subjectName: string;
  nodes: SemanticNebulaNode[];
}) {
  const positiveNodes = input.nodes.filter((node) => node.polarity === "POSITIVE");
  const negativeNodes = input.nodes.filter((node) => node.polarity === "NEGATIVE");
  const competitorNodes = input.nodes.filter((node) => node.termType === "COMPETITOR" || node.context.competitorContext);
  const missingNodes = input.nodes.filter((node) => node.termType === "MISSING" || node.context.missingDesired);
  const riskNodes = input.nodes.filter((node) => node.context.riskContext || node.polarity === "NEGATIVE");

  return {
    scope: input.scope,
    version: semanticNebulaVersion,
    nodePolicy: semanticNebulaNodePolicy,
    entityType: input.entityType,
    subjectName: input.subjectName,
    totalTerms: input.nodes.length,
    positiveGravity: averageGravity(positiveNodes),
    negativeGravity: averageGravity(negativeNodes),
    missingDesiredTerms: missingNodes.length,
    competitorGravity: averageGravity(competitorNodes),
    incorrectAssociationRisk: averageGravity(riskNodes),
    strongestPositiveTerms: positiveNodes.slice(0, 6).map((node) => node.term),
    strongestNegativeTerms: negativeNodes.slice(0, 6).map((node) => node.term),
    competitorOwnedTerms: competitorNodes.slice(0, 6).map((node) => node.term),
    missingTerms: missingNodes.slice(0, 6).map((node) => node.term),
    riskTerms: riskNodes.slice(0, 6).map((node) => node.term),
  };
}

function averageGravity(nodes: SemanticNebulaNode[]) {
  if (!nodes.length) return 0;
  return Math.round(nodes.reduce((total, node) => total + node.semanticGravity, 0) / nodes.length);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function collectTerms(values: unknown[]) {
  const terms = new Set<string>();
  for (const value of values) {
    if (typeof value === "string") {
      terms.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") terms.add(item);
        if (item && typeof item === "object" && "term" in item && typeof item.term === "string") terms.add(item.term);
        if (item && typeof item === "object" && "keyword" in item && typeof item.keyword === "string") terms.add(item.keyword);
      }
    }
  }
  return Array.from(terms);
}

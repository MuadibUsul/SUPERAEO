import type { SubjectEntityType } from "@/generated/prisma/client";

import { getNebulaScopeDefinition } from "@/server/semantic-nebula/nebula-registry";
import type { SemanticCluster } from "@/server/semantic-nebula/semantic-clustering";
import type { SemanticUnit } from "@/server/semantic-nebula/semantic-unit";
import {
  semanticNebulaVersion,
  semanticNebulaMaxNodes,
  semanticNebulaNodePolicy,
  type NebulaScope,
  type SemanticEvidenceItem,
  type SemanticNebulaBuildResult,
  type SemanticNebulaNode,
  type SemanticPolarity,
  type SemanticTermType,
} from "@/server/semantic-nebula/types";

export type StructuredSemanticEvidence = {
  prompt: string;
  rawResponse?: string | null;
  provider?: string | null;
  model?: string | null;
  createdAt?: Date | null;
};

export function buildStructuredSemanticNebula(input: {
  subjectName: string;
  entityType: SubjectEntityType;
  scope: NebulaScope;
  iteration: number;
  units: SemanticUnit[];
  clusters: SemanticCluster[];
  evidenceByResponseId?: Map<string, StructuredSemanticEvidence>;
}): SemanticNebulaBuildResult {
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));
  const maxProbeOccurrences = Math.max(1, ...input.clusters.map((cluster) => cluster.probeOccurrenceCount));
  const allNodes = input.clusters
    .map((cluster) => buildNode(cluster, unitsById, maxProbeOccurrences, input.iteration, input.evidenceByResponseId))
    .sort((a, b) => b.semanticGravity - a.semanticGravity);
  const nodes = allNodes.filter(getNebulaScopeDefinition(input.scope).filter).slice(0, semanticNebulaMaxNodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const subjectId = `subject:${input.subjectName}`;
  const edges = input.clusters.flatMap((cluster) => {
    const node = nodeById.get(cluster.id);
    if (!node) return [];
    const members = cluster.memberIds.map((id) => unitsById.get(id)).filter((unit): unit is SemanticUnit => Boolean(unit));
    const predicates = Array.from(new Set(members.map((unit) => unit.predicate).filter((value): value is string => Boolean(value))));
    const relation = predicates[0] ?? "ASSOCIATED_WITH";
    return [{
      id: `${subjectId}->${cluster.id}:${relation}`,
      source: subjectId,
      target: cluster.id,
      edgeType: edgeType(node, relation),
      weight: node.semanticGravity / 100,
      confidence: node.semanticMeta?.confidence ?? 0.5,
      evidenceCount: node.sourceCount,
      semanticMeta: {
        canonicalRelation: relation,
        relationDomain: cluster.domain,
        confidence: node.semanticMeta?.confidence ?? 0.5,
        negated: members.some((unit) => unit.negated),
      },
    }];
  });
  const evidence = Object.fromEntries(nodes.map((node) => [node.normalizedTerm, node.examples]));

  return {
    scope: input.scope,
    nodes,
    edges,
    evidence,
    summary: {
      scope: input.scope,
      version: semanticNebulaVersion,
      nodePolicy: semanticNebulaNodePolicy,
      entityType: input.entityType,
      subjectName: input.subjectName,
      totalTerms: nodes.length,
      positiveGravity: average(nodes.filter((node) => node.polarity === "POSITIVE")),
      negativeGravity: average(nodes.filter((node) => node.polarity === "NEGATIVE")),
      missingDesiredTerms: 0,
      competitorGravity: average(nodes.filter((node) => node.context.competitorContext)),
      incorrectAssociationRisk: average(nodes.filter((node) => node.context.riskContext)),
      strongestPositiveTerms: nodes.filter((node) => node.polarity === "POSITIVE").slice(0, 6).map((node) => node.term),
      strongestNegativeTerms: nodes.filter((node) => node.polarity === "NEGATIVE").slice(0, 6).map((node) => node.term),
      competitorOwnedTerms: nodes.filter((node) => node.context.competitorContext).slice(0, 6).map((node) => node.term),
      missingTerms: [],
      riskTerms: nodes.filter((node) => node.context.riskContext).slice(0, 6).map((node) => node.term),
    },
  };
}

function buildNode(
  cluster: SemanticCluster,
  unitsById: Map<string, SemanticUnit>,
  maxProbeOccurrences: number,
  currentIteration: number,
  evidenceByResponseId?: Map<string, StructuredSemanticEvidence>,
): SemanticNebulaNode {
  const members = cluster.memberIds.map((id) => unitsById.get(id)).filter((unit): unit is SemanticUnit => Boolean(unit));
  const confidence = averageNumber(members.map((unit) => unit.confidence ?? 0.5));
  const occurrence = Math.log1p(cluster.probeOccurrenceCount) / Math.log1p(maxProbeOccurrences);
  const modelCoverage = Math.min(1, cluster.modelIds.length / 4);
  const iterationSpan = Math.max(1, cluster.lastSeenIteration - cluster.firstSeenIteration + 1);
  const stability = Math.min(1, iterationSpan / Math.max(1, currentIteration));
  const gravity = Math.round(100 * (0.45 * occurrence + 0.35 * confidence + 0.1 * modelCoverage + 0.1 * stability));
  const polarity = majorityPolarity(members);
  const termType = termTypeFor(cluster, members, polarity);
  const examples = members.flatMap((unit) => evidenceForUnit(unit, evidenceByResponseId)).slice(0, 5);
  const latestDiscovery = cluster.lastSeenIteration === currentIteration;

  return {
    id: cluster.id,
    term: cluster.representativeLabel,
    normalizedTerm: cluster.representativeLabel,
    termType,
    polarity,
    semanticGravity: gravity,
    proximityScore: Math.round(confidence * 100),
    frequencyScore: Math.round(occurrence * 100),
    stabilityScore: Math.round(stability * 100),
    coMentionStrength: Math.round(occurrence * 100),
    recommendationContextWeight: termType === "POSITIVE" || termType === "BENEFIT" ? gravity : 0,
    evidenceConfidence: Math.round(confidence * 100),
    sourceCount: new Set(members.map((unit) => unit.source.responseId).filter(Boolean)).size,
    promptCount: cluster.probeOccurrenceCount,
    modelCount: cluster.modelIds.length,
    models: cluster.modelIds,
    firstSeenAt: null,
    lastSeenAt: null,
    components: {
      frequencyScore: Math.round(occurrence * 100),
      scenarioStabilityScore: Math.round(stability * 100),
      coMentionStrength: Math.round(occurrence * 100),
      sentimentWeight: polarity === "POSITIVE" ? 100 : polarity === "NEGATIVE" ? 0 : 50,
      recommendationContextWeight: termType === "POSITIVE" || termType === "BENEFIT" ? gravity : 0,
      evidenceConfidence: Math.round(confidence * 100),
    },
    examples,
    context: {
      competitorContext: cluster.relationTypes.includes("COMPETES_WITH") || members.some((unit) => unit.type.includes("COMPETITOR")),
      riskContext: (cluster.domain === "RISK_OPPORTUNITY" && members.some((unit) => unit.type.includes("RISK"))) || polarity === "NEGATIVE",
      missingDesired: false,
    },
    semanticMeta: {
      domain: cluster.domain,
      type: members[0]?.type ?? "CONCEPT",
      clusterId: cluster.id,
      firstSeenIteration: cluster.firstSeenIteration,
      probeOccurrenceCount: cluster.probeOccurrenceCount,
      noveltyScore: latestDiscovery ? 1 / Math.max(1, cluster.memberCount) : 0,
      confidence,
      crossModelOccurrenceCount: cluster.modelIds.length,
    },
  };
}

function evidenceForUnit(unit: SemanticUnit, evidenceByResponseId?: Map<string, StructuredSemanticEvidence>): SemanticEvidenceItem[] {
  const source = unit.source.responseId ? evidenceByResponseId?.get(unit.source.responseId) : undefined;
  return [{
    queryId: unit.source.probeId,
    responseId: unit.source.responseId,
    runId: unit.source.runId,
    question: source?.prompt ?? null,
    excerpt: (source?.rawResponse || unit.description || unit.surfaceForm).slice(0, 800),
    probeFamily: unit.domain,
    queryType: unit.type,
    scenario: unit.condition ?? null,
    provider: source?.provider ?? unit.source.providerId ?? null,
    model: source?.model ?? unit.source.modelId ?? null,
    createdAt: source?.createdAt?.toISOString() ?? null,
    contextFlags: [unit.negated ? "negated" : "affirmed", unit.uncertainty ?? "unknown"],
  }];
}

function termTypeFor(cluster: SemanticCluster, members: SemanticUnit[], polarity: SemanticPolarity): SemanticTermType {
  if (cluster.relationTypes.includes("COMPETES_WITH") || members.some((unit) => unit.type.includes("COMPETITOR"))) return "COMPETITOR";
  if (cluster.domain === "CONTEXT") return members.some((unit) => unit.type.includes("AUDIENCE")) ? "AUDIENCE" : "SCENARIO";
  if (cluster.domain === "RISK_OPPORTUNITY") return members.some((unit) => unit.type.includes("RISK")) ? "RISK" : "BENEFIT";
  if (cluster.domain === "FUNCTION" || cluster.domain === "ACTION" || cluster.domain === "CAUSE_EFFECT") return "FUNCTIONAL";
  if (cluster.domain === "EVIDENCE") return "TRUST";
  if (polarity === "POSITIVE") return "POSITIVE";
  if (polarity === "NEGATIVE") return "NEGATIVE";
  return "DESCRIPTIVE";
}

function majorityPolarity(units: SemanticUnit[]): SemanticPolarity {
  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const unit of units) counts[unit.polarity ?? "neutral"] += 1;
  if (counts.positive > counts.negative && counts.positive > counts.neutral) return "POSITIVE";
  if (counts.negative > counts.positive && counts.negative > counts.neutral) return "NEGATIVE";
  return "NEUTRAL";
}

function edgeType(node: SemanticNebulaNode, relation: string) {
  if (relation === "COMPETES_WITH" || node.context.competitorContext) return "competitor_context" as const;
  if (node.context.riskContext) return "risk_context" as const;
  return relation === "ASSOCIATED_WITH" ? "subject_term" as const : "term_term" as const;
}

function average(nodes: SemanticNebulaNode[]) {
  return nodes.length ? Math.round(nodes.reduce((total, node) => total + node.semanticGravity, 0) / nodes.length) : 0;
}

function averageNumber(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

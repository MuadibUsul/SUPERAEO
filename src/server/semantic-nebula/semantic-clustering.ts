import { createHash } from "node:crypto";

import { semanticUnitKey, type SemanticUnit } from "@/server/semantic-nebula/semantic-unit";
import type { SemanticDomain } from "@/server/semantic-nebula/ontology";

export type SemanticCluster = {
  id: string;
  domain: SemanticDomain;
  representativeLabel: string;
  centroid: number[];
  memberCount: number;
  probeOccurrenceCount: number;
  relationTypes: string[];
  firstSeenIteration: number;
  lastSeenIteration: number;
  modelIds: string[];
  memberIds: string[];
};

export type SemanticClusterResult = {
  clusters: SemanticCluster[];
  assignments: Record<string, string>;
  exactDuplicates: number;
  semanticDuplicates: number;
};

export function clusterSemanticUnits(input: {
  units: SemanticUnit[];
  vectors?: Record<string, number[]>;
  duplicateThreshold?: number;
  clusterThreshold?: number;
  maxLocalCandidates?: number;
}): SemanticClusterResult {
  const duplicateThreshold = input.duplicateThreshold ?? 0.92;
  const clusterThreshold = input.clusterThreshold ?? 0.85;
  const maxLocalCandidates = input.maxLocalCandidates ?? 256;
  const clusters: SemanticCluster[] = [];
  const exact = new Map<string, SemanticCluster>();
  const byDomain = new Map<SemanticDomain, SemanticCluster[]>();
  const assignments: Record<string, string> = {};
  let exactDuplicates = 0;
  let semanticDuplicates = 0;

  for (const unit of input.units) {
    const vector = input.vectors?.[unit.id] ?? lexicalVector(unit.canonicalLabel);
    const key = semanticUnitKey(unit);
    let cluster = exact.get(key);
    if (cluster) {
      exactDuplicates += 1;
      addToCluster(cluster, unit, vector);
      assignments[unit.id] = cluster.id;
      continue;
    }

    const candidates = (byDomain.get(unit.domain) ?? []).slice(-maxLocalCandidates);
    let best: { cluster: SemanticCluster; similarity: number } | undefined;
    for (const candidate of candidates) {
      if (candidate.centroid.length !== vector.length) continue;
      const similarity = cosineSimilarity(candidate.centroid, vector);
      if (!best || similarity > best.similarity) best = { cluster: candidate, similarity };
    }

    if (best && best.similarity >= clusterThreshold) {
      cluster = best.cluster;
      if (best.similarity >= duplicateThreshold) semanticDuplicates += 1;
      addToCluster(cluster, unit, vector);
    } else {
      cluster = createCluster(unit, vector);
      clusters.push(cluster);
      byDomain.set(unit.domain, [...(byDomain.get(unit.domain) ?? []), cluster]);
    }
    exact.set(key, cluster);
    assignments[unit.id] = cluster.id;
  }

  return { clusters, assignments, exactDuplicates, semanticDuplicates };
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aa += a[index] * a[index];
    bb += b[index] * b[index];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export function lexicalVector(value: string, dimensions = 96) {
  const normalized = ` ${value.normalize("NFKC").toLowerCase()} `;
  const vector = Array.from({ length: dimensions }, () => 0);
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const gram = normalized.slice(index, index + 2);
    let hash = 2166136261;
    for (const character of gram) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    vector[(hash >>> 0) % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((total, item) => total + item * item, 0));
  return magnitude ? vector.map((item) => item / magnitude) : vector;
}

function createCluster(unit: SemanticUnit, vector: number[]): SemanticCluster {
  return {
    id: `sc_${createHash("sha1").update(`${unit.domain}|${semanticUnitKey(unit)}`).digest("hex").slice(0, 16)}`,
    domain: unit.domain,
    representativeLabel: unit.canonicalLabel,
    centroid: [...vector],
    memberCount: 1,
    probeOccurrenceCount: unit.source.probeId ? 1 : 0,
    relationTypes: unit.predicate ? [unit.predicate] : [],
    firstSeenIteration: unit.iteration,
    lastSeenIteration: unit.iteration,
    modelIds: unit.source.modelId ? [unit.source.modelId] : [],
    memberIds: [unit.id],
  };
}

function addToCluster(cluster: SemanticCluster, unit: SemanticUnit, vector: number[]) {
  const oldCount = cluster.memberCount;
  cluster.centroid = cluster.centroid.map((value, index) => (oldCount * value + vector[index]) / (oldCount + 1));
  cluster.memberCount += 1;
  cluster.firstSeenIteration = Math.min(cluster.firstSeenIteration, unit.iteration);
  cluster.lastSeenIteration = Math.max(cluster.lastSeenIteration, unit.iteration);
  cluster.memberIds.push(unit.id);
  if (unit.predicate && !cluster.relationTypes.includes(unit.predicate)) cluster.relationTypes.push(unit.predicate);
  if (unit.source.modelId && !cluster.modelIds.includes(unit.source.modelId)) cluster.modelIds.push(unit.source.modelId);
  if (unit.source.probeId) cluster.probeOccurrenceCount = Math.max(1, cluster.probeOccurrenceCount);
}

export function applyProbeOccurrenceCounts(clusters: SemanticCluster[], units: SemanticUnit[], assignments: Record<string, string>) {
  const probesByCluster = new Map<string, Set<string>>();
  for (const unit of units) {
    const clusterId = assignments[unit.id];
    if (!clusterId || !unit.source.probeId) continue;
    const probes = probesByCluster.get(clusterId) ?? new Set<string>();
    probes.add(unit.source.probeId);
    probesByCluster.set(clusterId, probes);
  }
  for (const cluster of clusters) cluster.probeOccurrenceCount = probesByCluster.get(cluster.id)?.size ?? 0;
  return clusters;
}

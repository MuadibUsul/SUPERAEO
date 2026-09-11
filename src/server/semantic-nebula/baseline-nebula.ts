/**
 * Baseline structured nebula assembly.
 *
 * Turns the structured `semanticUnits` the answer-extractor now emits per
 * sampled answer into `SemanticUnit`s + clusters, so a plain sampling run can
 * feed the SAME structured nebula builder the brand-probe exploration path uses
 * — instead of the regex/markdown term scraper. The model does the segmentation;
 * this module only shapes and clusters what it returned.
 *
 * Pure and deterministic so it can be unit tested without a database.
 */
import { isRecord, numberOrDefault } from "@/server/utils/coerce";
import { clusterSemanticUnits, type SemanticCluster } from "@/server/semantic-nebula/semantic-clustering";
import { extractProbeSemanticUnits, type SemanticUnit, type SemanticUnitInput } from "@/server/semantic-nebula/semantic-unit";

/** The slice of an AIResponse + its answer_extraction result this needs. */
export type BaselineUnitResponse = {
  id: string;
  runId: string;
  providerId: string | null;
  model: string;
  /** The stored `answer_extraction` probeResult normalizedJson. */
  normalizedJson: unknown;
};

export function semanticUnitsFromResponses(input: {
  projectId: string;
  subjectId: string;
  responses: BaselineUnitResponse[];
}): SemanticUnit[] {
  const collected: SemanticUnit[] = [];
  for (const response of input.responses) {
    const json = isRecord(response.normalizedJson) ? response.normalizedJson : {};
    const semanticUnits = asUnitInputs(json.semanticUnits);
    const keywords = asStringList(json.matchedKeywords);
    const competitors = comparisonEntityNames(json.mentionedEntities);
    if (semanticUnits.length === 0 && keywords.length === 0 && competitors.length === 0) continue;

    // extractProbeSemanticUnits re-validates each unit, dedupes within this one
    // answer, and folds in keyword/competitor fallback units for coverage.
    collected.push(
      ...extractProbeSemanticUnits({
        projectId: input.projectId,
        subjectId: input.subjectId,
        runId: response.runId,
        probeId: response.id,
        responseId: response.id,
        providerId: response.providerId,
        model: response.model,
        iteration: 0,
        semanticDepth: 0,
        zone: "core_semantics",
        data: {
          semantic_units: semanticUnits,
          keywords,
          competitors,
          confidence: numberOrDefault(json.confidence, 0.5),
        },
      }),
    );
  }
  return collected;
}

/** Cluster with the lexical-vector fallback; embeddings are layered on later. */
export function clusterBaselineUnits(units: SemanticUnit[]): SemanticCluster[] {
  return clusterSemanticUnits({ units }).clusters;
}

function asUnitInputs(value: unknown): SemanticUnitInput[] {
  return (Array.isArray(value) ? value : []).filter(isRecord) as SemanticUnitInput[];
}

function asStringList(value: unknown): string[] {
  return (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function comparisonEntityNames(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .filter((entity) => entity.role === "comparison")
    .map((entity) => (typeof entity.name === "string" ? entity.name.trim() : ""))
    .filter(Boolean);
}

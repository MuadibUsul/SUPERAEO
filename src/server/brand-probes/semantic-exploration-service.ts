import type { Prisma } from "@/generated/prisma/client";

import { calculateExplorationMetrics, evaluateSaturation, coverageGaps, type ExplorationIterationMetrics } from "@/server/analysis/semantic-exploration-metrics";
import { generateAdaptiveProbeCandidates, selectDiverseAdaptiveProbes } from "@/server/brand-probes/adaptive-probe-planner";
import { probeResponseSchema } from "@/server/brand-probes/types";
import { embedTexts, resolveEmbeddingConfig } from "@/server/ai/embeddings";
import { getPrisma } from "@/server/db";
import { recordTraceEvent } from "@/server/observability/event-log";
import { applyProbeOccurrenceCounts, clusterSemanticUnits } from "@/server/semantic-nebula/semantic-clustering";
import { extractProbeSemanticUnits, type SemanticUnit } from "@/server/semantic-nebula/semantic-unit";
import { nearestTermBatch, upsertTermVectors } from "@/server/semantic-nebula/vector-store";

export const semanticCoverageSchemaVersion = 2;

export type SemanticExplorationStopReason =
  | "SEMANTIC_SATURATION"
  | "MAX_ITERATIONS"
  | "MAX_PROBES"
  | "TOKEN_BUDGET"
  | "COST_BUDGET"
  | "TIME_BUDGET"
  | "NO_VALID_PROBES"
  | "MANUAL_CANCEL"
  | "ERROR";

export type SemanticExplorationConfig = {
  enabled: boolean;
  maxIterations: number;
  maxAdditionalProbes: number;
  probesPerIteration: number;
  maxSemanticDepth: number;
  duplicateThreshold: number;
  semanticDuplicateThreshold: number;
  clusterThreshold: number;
  maxTokens: number;
  maxCost: number;
  maxDurationMs: number;
};

const embeddingCache = new Map<string, number[]>();

export function getSemanticExplorationConfig(enabledOverride?: boolean): SemanticExplorationConfig {
  return {
    enabled: enabledOverride ?? process.env.SEMANTIC_EXPLORATION_ENABLED === "true",
    maxIterations: intEnv("SEMANTIC_EXPLORATION_MAX_ITERATIONS", 41),
    maxAdditionalProbes: intEnv("SEMANTIC_EXPLORATION_MAX_ADDITIONAL_PROBES", 640),
    probesPerIteration: intEnv("SEMANTIC_EXPLORATION_PROBES_PER_ITERATION", 16),
    maxSemanticDepth: intEnv("SEMANTIC_EXPLORATION_MAX_DEPTH", 2),
    duplicateThreshold: floatEnv("SEMANTIC_EXPLORATION_PROBE_DUPLICATE_THRESHOLD", 0.9),
    semanticDuplicateThreshold: floatEnv("SEMANTIC_EXPLORATION_UNIT_DUPLICATE_THRESHOLD", 0.92),
    clusterThreshold: floatEnv("SEMANTIC_EXPLORATION_CLUSTER_THRESHOLD", 0.85),
    maxTokens: nonNegativeIntEnv("SEMANTIC_EXPLORATION_MAX_TOKENS", 1_000_000),
    maxCost: nonNegativeFloatEnv("SEMANTIC_EXPLORATION_MAX_COST", 2),
    maxDurationMs: intEnv("SEMANTIC_EXPLORATION_MAX_DURATION_MS", 14_400_000),
  };
}

export async function advanceSemanticExploration(input: { runId: string; analysisJobId?: string | null; enabled?: boolean }) {
  const config = getSemanticExplorationConfig(input.enabled);
  if (!config.enabled) return { enabled: false as const, continue: false as const, createdProbeCount: 0 };

  const prisma = getPrisma();
  const run = await prisma.brandProbeRun.findUnique({
    where: { id: input.runId },
    include: {
      project: { include: { subjects: { orderBy: { createdAt: "asc" } } } },
      subject: true,
      probes: {
        include: { responses: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!run) throw new Error("Brand probe run not found for semantic exploration.");
  const subject = run.subject ?? run.project.subjects.find((item) => item.isPrimary) ?? run.project.subjects[0];
  if (!subject) throw new Error("Project subject not found for semantic exploration.");

  const previousConfig = asRecord(run.configJson);
  const previousExploration = asRecord(previousConfig.semanticExploration);
  const history = asMetricsHistory(previousExploration.history);
  const iteration = history.length + 1;
  const initialProbeCount = numberValue(previousExploration.initialProbeCount, run.totalProbes);
  let units = collectUnits(run.probes, {
    projectId: run.projectId,
    subjectId: subject.id,
    runId: run.id,
  });
  const embedding = await embedUnits(units);
  const ann = await canonicalizeUnitsWithAnn({ projectId: run.projectId, subjectId: subject.id, units, embedding });
  units = ann.units;
  const clustered = clusterSemanticUnits({
    units,
    vectors: embedding.vectors,
    duplicateThreshold: config.semanticDuplicateThreshold,
    clusterThreshold: config.clusterThreshold,
  });
  applyProbeOccurrenceCounts(clustered.clusters, units, clustered.assignments);
  const metrics = calculateExplorationMetrics({
    iteration,
    totalProbes: run.totalProbes,
    units,
    clusters: clustered.clusters,
    previous: history.at(-1),
    entityType: subject.entityType,
  });
  const nextHistory = [...history, metrics];
  const saturation = evaluateSaturation(nextHistory);
  const usage = run.probes.flatMap((probe) => probe.responses).reduce((total, response) => ({
    tokens: total.tokens + (response.totalTokens ?? 0),
    cost: total.cost + (response.costEstimate ?? 0),
  }), { tokens: 0, cost: 0 });
  const elapsedMs = run.startedAt ? Date.now() - run.startedAt.getTime() : 0;
  const stopReason = budgetStopReason({ config, iteration, totalProbes: run.totalProbes, initialProbeCount, usage, elapsedMs }) ?? (saturation.saturated ? "SEMANTIC_SATURATION" : undefined);
  const gaps = coverageGaps(metrics);

  const perModel = Object.fromEntries(Array.from(new Set(units.map((unit) => unit.source.modelId).filter(Boolean))).map((modelId) => {
    const modelUnits = units.filter((unit) => unit.source.modelId === modelId);
    const result = clusterSemanticUnits({ units: modelUnits, vectors: embedding.vectors, duplicateThreshold: config.semanticDuplicateThreshold, clusterThreshold: config.clusterThreshold });
    applyProbeOccurrenceCounts(result.clusters, modelUnits, result.assignments);
    return [modelId!, calculateExplorationMetrics({ iteration, totalProbes: run.totalProbes, units: modelUnits, clusters: result.clusters, entityType: subject.entityType })];
  }));

  const coverageEvidence = {
    schemaVersion: semanticCoverageSchemaVersion,
    subjectId: subject.id,
    brandProbeRunId: run.id,
    overall: {
      observedCoverage: metrics.observedCoverage,
      estimatedCoverage: metrics.estimatedCoverage,
      saturationScore: metrics.saturationScore,
    },
    exploration: {
      status: stopReason ? "COMPLETED" : "EXPLORING",
      iterations: iteration,
      totalProbes: run.totalProbes,
      stopReason: stopReason ?? null,
      rolling: saturation.rolling,
      underexploredCriticalDomains: saturation.underexploredCriticalDomains,
    },
    semantic: {
      uniqueTerms: metrics.uniqueTerms,
      semanticUnits: metrics.semanticUnits,
      clusters: metrics.semanticClusters,
      relationTypes: metrics.relationTypes,
      exactDuplicates: clustered.exactDuplicates,
      semanticDuplicates: clustered.semanticDuplicates,
      annMatches: ann.matches,
    },
    novelty: metrics.novelty,
    estimate: { observedClusters: metrics.observedClusters, estimatedClusters: metrics.estimatedClusters },
    domains: metrics.domains,
    gaps,
    history: nextHistory,
    coverageByDepth: coverageByDepth(units, clustered.assignments),
    perModel,
    units,
    clusters: clustered.clusters.map((cluster) => ({ ...cluster, centroid: undefined, crossModelOccurrenceCount: cluster.modelIds.length })),
    embedding: { model: embedding.model, version: embedding.version, dimensions: embedding.dimensions, fallback: embedding.fallback },
  };
  const coverageSnapshot = await prisma.semanticCoverageSnapshot.create({
    data: {
      projectId: run.projectId,
      topicBreadth: Object.values(metrics.domains).filter((domain) => domain.clusterCount > 0).length / Object.keys(metrics.domains).length,
      topicDepth: Math.min(1, Math.max(0, ...units.map((unit) => unit.semanticDepth), 0) / Math.max(1, config.maxSemanticDepth)),
      intentCoverage: Object.values(metrics.domains).filter((domain) => domain.unitCount > 0).length / Object.keys(metrics.domains).length,
      vocabularyDiversity: metrics.semanticUnits ? metrics.uniqueTerms / metrics.semanticUnits : 0,
      overallCoverage: metrics.estimatedCoverage,
      missingConcepts: gaps as unknown as Prisma.InputJsonValue,
      competitorGaps: gaps.filter((gap) => gap.domain === "RELATION" || gap.domain === "ENTITY") as unknown as Prisma.InputJsonValue,
      evidence: coverageEvidence as unknown as Prisma.InputJsonValue,
    },
  });

  await persistVectorMetadata({ run, subjectId: subject.id, units, assignments: clustered.assignments, vectors: embedding.vectors, embedding });
  await recordExplorationEvents({ runId: run.id, projectId: run.projectId, analysisJobId: input.analysisJobId, iteration, units, metrics, clusters: clustered.clusters.length, matched: clustered.exactDuplicates + clustered.semanticDuplicates, saturation: saturation.saturated });

  let selected: Awaited<ReturnType<typeof selectDiverseAdaptiveProbes>>["selected"] = [];
  let rejectedDuplicates = 0;
  let finalStopReason = stopReason;
  if (!finalStopReason) {
    const candidates = generateAdaptiveProbeCandidates({ subjectName: subject.displayName, language: subject.language, metrics, iteration: iteration + 1, maxSemanticDepth: config.maxSemanticDepth });
    const selection = await selectDiverseAdaptiveProbes({ candidates: candidates.filter((candidate) => candidate.qualityScore >= 0.72), historicalPrompts: run.probes.map((probe) => probe.prompt), limit: Math.min(config.probesPerIteration, initialProbeCount + config.maxAdditionalProbes - run.totalProbes), duplicateThreshold: config.duplicateThreshold });
    selected = selection.selected;
    rejectedDuplicates = selection.rejectedDuplicates;
    if (selected.length === 0) finalStopReason = "NO_VALID_PROBES";
  }

  if (selected.length > 0) {
    await prisma.brandProbe.createMany({
      data: selected.map((probe) => ({
        runId: run.id,
        projectId: run.projectId,
        subjectId: subject.id,
        dimension: probe.dimension,
        zone: probe.zone,
        questionType: probe.questionType,
        semanticTemperature: probe.semanticTemperature,
        weight: probe.weight,
        samplingWeight: probe.samplingWeight,
        measurementWeight: probe.measurementWeight,
        modelTemperature: probe.modelTemperature,
        language: probe.language,
        prompt: probe.prompt,
        expectedOutputSchema: probe.expectedOutputSchema as Prisma.InputJsonValue,
        variablesJson: { ...probe.variables, parentProbeId: null } as Prisma.InputJsonValue,
        qualityScore: probe.qualityScore,
        status: "pending",
      })),
    });
    await Promise.all(selected.map((probe) => recordTraceEvent({
      severity: "info", eventType: "adaptive_probe_generated", subsystem: "brand_probe", operation: "adaptive_probe_planning", status: "created", projectId: run.projectId, runId: run.id,
      metadata: { iteration: iteration + 1, domain: probe.intent.targetDomain, semanticDepth: probe.intent.semanticDepth, expectedInformationGain: probe.intent.expectedInformationGain },
    })));
  }
  if (rejectedDuplicates > 0) await recordTraceEvent({ severity: "info", eventType: "adaptive_probe_rejected_duplicate", subsystem: "brand_probe", operation: "adaptive_probe_planning", status: "filtered", projectId: run.projectId, runId: run.id, metadata: { iteration: iteration + 1, count: rejectedDuplicates } });

  if (finalStopReason && finalStopReason !== stopReason) {
    coverageEvidence.exploration.status = "COMPLETED";
    coverageEvidence.exploration.stopReason = finalStopReason;
    await prisma.semanticCoverageSnapshot.update({
      where: { id: coverageSnapshot.id },
      data: { evidence: coverageEvidence as unknown as Prisma.InputJsonValue },
    });
  }

  const nextConfig = {
    ...previousConfig,
    semanticExploration: {
      ...previousExploration,
      ...config,
      initialProbeCount,
      history: nextHistory,
      latestMetrics: metrics,
      latestGaps: gaps,
      rejectedDuplicateProbeCount: numberValue(previousExploration.rejectedDuplicateProbeCount, 0) + rejectedDuplicates,
      stopReason: finalStopReason ?? null,
      completedAt: finalStopReason ? new Date().toISOString() : null,
    },
  };
  await prisma.brandProbeRun.update({
    where: { id: run.id },
    data: {
      totalProbes: run.totalProbes + selected.length,
      currentStage: finalStopReason ? "SEMANTIC_EXPLORATION_COMPLETED" : "ADAPTIVE_PROBES_READY",
      configJson: nextConfig as Prisma.InputJsonValue,
    },
  });
  if (finalStopReason) await recordTraceEvent({ severity: "info", eventType: finalStopReason === "SEMANTIC_SATURATION" ? "semantic_saturation_reached" : "semantic_exploration_completed", subsystem: "semantic_exploration", operation: "semantic_exploration", status: "completed", projectId: run.projectId, runId: run.id, analysisJobId: input.analysisJobId ?? undefined, metadata: { stopReason: finalStopReason, iteration, totalProbes: run.totalProbes } });

  return { enabled: true as const, continue: selected.length > 0, createdProbeCount: selected.length, stopReason: finalStopReason, metrics, gaps };
}

function collectUnits(probes: Array<{ id: string; zone: string; variablesJson: Prisma.JsonValue | null; responses: Array<{ id: string; providerId: string | null; model: string; parsedJson: Prisma.JsonValue | null }> }>, context: { projectId: string; subjectId: string; runId: string }) {
  const units: SemanticUnit[] = [];
  for (const probe of probes) {
    const variables = asRecord(probe.variablesJson);
    for (const response of probe.responses) {
      const parsed = probeResponseSchema.safeParse(response.parsedJson);
      if (!parsed.success) continue;
      units.push(...extractProbeSemanticUnits({
        ...context,
        probeId: probe.id,
        responseId: response.id,
        providerId: response.providerId,
        model: response.model,
        iteration: numberValue(variables.iteration, 0),
        semanticDepth: numberValue(variables.semanticDepth, 0),
        zone: probe.zone,
        data: parsed.data,
      }));
    }
  }
  return units;
}

async function embedUnits(units: SemanticUnit[]) {
  const config = await resolveEmbeddingConfig().catch(() => null);
  if (!config || units.length === 0) return { vectors: undefined, model: null, version: "lexical-v1", dimensions: 96, fallback: true } as const;
  const labels = Array.from(new Set(units.map((unit) => unit.canonicalLabel)));
  const missing = labels.filter((label) => !embeddingCache.has(`${config.model}|v1|${label}`));
  if (missing.length > 0) {
    const vectors = await embedTexts(missing, config).catch(() => []);
    missing.forEach((label, index) => { if (vectors[index]?.length) embeddingCache.set(`${config.model}|v1|${label}`, vectors[index]); });
  }
  if (!labels.every((label) => embeddingCache.has(`${config.model}|v1|${label}`))) return { vectors: undefined, model: null, version: "lexical-v1", dimensions: 96, fallback: true } as const;
  const vectors = Object.fromEntries(units.map((unit) => [unit.id, embeddingCache.get(`${config.model}|v1|${unit.canonicalLabel}`)!]));
  return { vectors, model: config.model, version: "v1", dimensions: Object.values(vectors)[0]?.length ?? 0, fallback: false } as const;
}

async function persistVectorMetadata(input: { run: { id: string; projectId: string; project: { organizationId: string | null } }; subjectId: string; units: SemanticUnit[]; assignments: Record<string, string>; vectors: Record<string, number[]> | undefined; embedding: { model: string | null; version: string } }) {
  if (!input.vectors || !input.embedding.model) return;
  await upsertTermVectors({
    organizationId: input.run.project.organizationId,
    projectId: input.run.projectId,
    subjectId: input.subjectId,
    embeddingModel: input.embedding.model,
    embeddingVersion: input.embedding.version,
    probeRunId: input.run.id,
    terms: input.units.map((unit) => ({ label: unit.canonicalLabel, type: unit.type, semanticDomain: unit.domain, clusterId: input.assignments[unit.id], modelId: unit.source.modelId, vector: input.vectors![unit.id] })).filter((term) => term.vector?.length),
  });
}

async function canonicalizeUnitsWithAnn(input: { projectId: string; subjectId: string; units: SemanticUnit[]; embedding: { vectors: Record<string, number[]> | undefined; model: string | null; version: string } }) {
  if (!input.embedding.vectors || !input.embedding.model) return { units: input.units, matches: 0 };
  const results = await nearestTermBatch({
    projectId: input.projectId,
    subjectId: input.subjectId,
    embeddingModel: input.embedding.model,
    embeddingVersion: input.embedding.version,
    queries: input.units.map((unit) => ({ vector: input.embedding.vectors![unit.id], semanticDomain: unit.domain, modelId: unit.source.modelId })),
  });
  let matches = 0;
  const units = input.units.map((unit, index) => {
    const nearest = results[index]?.find((item) => item.score >= 0.92);
    if (!nearest) return unit;
    matches += 1;
    return { ...unit, canonicalLabel: nearest.label };
  });
  return { units, matches };
}

function budgetStopReason(input: { config: SemanticExplorationConfig; iteration: number; totalProbes: number; initialProbeCount: number; usage: { tokens: number; cost: number }; elapsedMs: number }): SemanticExplorationStopReason | undefined {
  if (input.totalProbes >= input.initialProbeCount + input.config.maxAdditionalProbes) return "MAX_PROBES";
  if (input.iteration >= input.config.maxIterations) return "MAX_ITERATIONS";
  if (input.config.maxTokens > 0 && input.usage.tokens >= input.config.maxTokens) return "TOKEN_BUDGET";
  if (input.config.maxCost > 0 && input.usage.cost >= input.config.maxCost) return "COST_BUDGET";
  if (input.elapsedMs >= input.config.maxDurationMs) return "TIME_BUDGET";
  return undefined;
}

function coverageByDepth(units: SemanticUnit[], assignments: Record<string, string>) {
  const result: Record<string, { semanticUnits: number; clusters: number; domains: string[] }> = {};
  for (const depth of Array.from(new Set(units.map((unit) => unit.semanticDepth)))) {
    const atDepth = units.filter((unit) => unit.semanticDepth === depth);
    result[String(depth)] = { semanticUnits: atDepth.length, clusters: new Set(atDepth.map((unit) => assignments[unit.id]).filter(Boolean)).size, domains: Array.from(new Set(atDepth.map((unit) => unit.domain))) };
  }
  return result;
}

async function recordExplorationEvents(input: { runId: string; projectId: string; analysisJobId?: string | null; iteration: number; units: SemanticUnit[]; metrics: ExplorationIterationMetrics; clusters: number; matched: number; saturation: boolean }) {
  const common = { subsystem: "semantic_exploration", operation: "semantic_exploration", projectId: input.projectId, runId: input.runId, analysisJobId: input.analysisJobId ?? undefined };
  await Promise.all([
    recordTraceEvent({ ...common, eventType: "semantic_ontology_unit_discovered", status: "completed", metadata: { iteration: input.iteration, count: input.units.length } }),
    recordTraceEvent({ ...common, eventType: "semantic_unit_canonicalized", status: "completed", metadata: { iteration: input.iteration, count: input.units.length } }),
    recordTraceEvent({ ...common, eventType: "semantic_cluster_created", status: "completed", metadata: { iteration: input.iteration, count: input.clusters } }),
    recordTraceEvent({ ...common, eventType: "semantic_cluster_matched", status: "completed", metadata: { iteration: input.iteration, count: input.matched } }),
    recordTraceEvent({ ...common, eventType: "semantic_domain_coverage_updated", status: "completed", metadata: { iteration: input.iteration, domains: input.metrics.domains } }),
    recordTraceEvent({ ...common, eventType: "semantic_iteration_completed", status: "completed", metadata: { iteration: input.iteration, novelty: input.metrics.novelty, estimatedCoverage: input.metrics.estimatedCoverage, saturation: input.saturation } }),
  ]);
}

function asMetricsHistory(value: unknown): ExplorationIterationMetrics[] {
  return Array.isArray(value) ? value.filter((item): item is ExplorationIterationMetrics => Boolean(item && typeof item === "object" && "iteration" in item)) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function floatEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

function nonNegativeFloatEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

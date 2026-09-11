/**
 * Proof service — ties the causal/correlation engine to stored data.
 *
 *  - computeExperimentResult: difference-in-differences for a treatment/control
 *    experiment, persisted as an ExperimentResult.
 *  - getProofView: everything the customer Proof page needs.
 *  - computeVisibilityOutcomeCorrelation: pairs the AI-visibility time series
 *    with an imported business-outcome series and reports correlation + lag.
 */
import type { ExperimentArm, ExperimentWaveType, Prisma, SubjectEntityType } from "@/generated/prisma/client";
import { createHash } from "node:crypto";
import { getPrisma } from "@/server/db";
import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { platformFromProviderType } from "@/server/ai/platform";
import { modelKeyFromParts } from "@/server/metrics/cip-metrics";
import {
  differenceInDifferences,
  clusteredDifferenceInDifferences,
  laggedCorrelation,
  pearson,
  requiredQuestionsPerArm,
  type DifferenceInDifferences,
  type LaggedCorrelation,
} from "@/server/analysis/causal-statistics";
import { isRecord } from "@/server/utils/coerce";

export const DEFAULT_OUTCOME_METRIC = "ai_referral_sessions";

type ArmProportion = { successes: number; samples: number };
type ExperimentAssignmentInput = { queryId: string; arm: ExperimentArm };

export function defaultExperimentMetricForEntity(entityType: SubjectEntityType | string | null | undefined) {
  if (entityType === "PERSON") return "factualAccuracy";
  if (entityType === "PRODUCT") return "featureAccuracy";
  if (entityType === "WEBSITE") return "citationRate";
  return "recommendationShare";
}

export async function createCognitionExperiment(input: {
  projectId: string;
  subjectId?: string | null;
  name: string;
  hypothesis?: string | null;
  metricKey?: string | null;
  queryIds: string[];
  assignments?: ExperimentAssignmentInput[];
  sampleCountPerQuery?: number;
  preregistered?: boolean;
  confirmatory?: boolean;
}) {
  const prisma = getPrisma();
  const subject = input.subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: input.subjectId }, select: { id: true, entityType: true } })
    : await prisma.projectSubject.findFirst({
        where: { projectId: input.projectId, isPrimary: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, entityType: true },
      });
  const queryIds = [...new Set(input.queryIds)].filter(Boolean);
  if (queryIds.length < 2) {
    throw new Error("Select at least two questions for an experiment.");
  }

  const queries = await prisma.aeoQuery.findMany({
    where: { projectId: input.projectId, id: { in: queryIds } },
    select: { id: true, queryType: true, confidence: true },
    orderBy: { createdAt: "asc" },
  });
  if (queries.length < 2) {
    throw new Error("Experiment questions were not found for this project.");
  }

  const validQueryIds = queries.map((query) => query.id);
  const assignmentSeed = createHash("sha256").update(`${input.projectId}:${input.name}:${validQueryIds.sort().join(",")}`).digest("hex").slice(0, 24);
  const assignments = normalizeAssignments(queries, input.assignments, assignmentSeed);
  const treatmentCount = assignments.filter((assignment) => assignment.arm === "treatment").length;
  const controlCount = assignments.filter((assignment) => assignment.arm === "control").length;
  if (treatmentCount === 0 || controlCount === 0) {
    throw new Error("Experiment needs at least one treatment and one control question.");
  }

  return prisma.cognitionExperiment.create({
    data: {
      projectId: input.projectId,
      subjectId: subject?.id ?? null,
      name: input.name,
      hypothesis: input.hypothesis || null,
      metricKey: input.metricKey || defaultExperimentMetricForEntity(subject?.entityType),
      assignmentSeed,
      preregistered: input.preregistered === true,
      protocol: {
        version: "2026-09-09.quasi-experiment.v1",
        frozenAt: new Date().toISOString(),
        hypothesis: input.hypothesis || null,
        primaryMetric: input.metricKey || defaultExperimentMetricForEntity(subject?.entityType),
        sampling: { samplesPerQuestionPerModelPerWave: input.sampleCountPerQuery ?? 3 },
        assignment: { method: "seeded_stratified", seed: assignmentSeed, strata: ["queryType", "baselineConfidenceBand"] },
        analysisUnit: "question",
        minimumDetectableEffect: 0.15,
        alpha: 0.05,
        power: 0.8,
        confirmatory: input.confirmatory === true,
        exclusionRules: ["failed_call", "missing_metric_assessment", "model_configuration_changed"],
      } as Prisma.InputJsonValue,
      status: "draft",
      assignments: {
        create: assignments.map((assignment) => ({
          queryId: assignment.queryId,
          arm: assignment.arm,
        })),
      },
    },
    include: {
      assignments: { include: { query: true }, orderBy: { createdAt: "asc" } },
      waves: { include: { observations: true }, orderBy: { measuredAt: "asc" } },
      results: { orderBy: { computedAt: "desc" }, take: 1 },
    },
  });
}

function normalizeAssignments(queries: Array<{ id: string; queryType: string; confidence: number | null }>, assignments: ExperimentAssignmentInput[] | undefined, seed: string) {
  const queryIds = queries.map((query) => query.id);
  if (assignments?.length) {
    const valid = new Set(queryIds);
    const byQuery = new Map<string, ExperimentArm>();
    for (const assignment of assignments) {
      if (valid.has(assignment.queryId)) byQuery.set(assignment.queryId, assignment.arm);
    }
    return queryIds.map((queryId, index) => ({
      queryId,
      arm: byQuery.get(queryId) ?? (index % 2 === 0 ? "treatment" : "control"),
    }));
  }

  const strata = new Map<string, typeof queries>();
  for (const query of queries) {
    const confidenceBand = query.confidence === null ? "unknown" : query.confidence >= 0.7 ? "high" : "low";
    const key = `${query.queryType}:${confidenceBand}`;
    strata.set(key, [...(strata.get(key) ?? []), query]);
  }
  return [...strata.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, items]) =>
    [...items].sort((a, b) => seededOrder(`${seed}:${key}:${a.id}`) - seededOrder(`${seed}:${key}:${b.id}`)).map((query, index) => ({ queryId: query.id, arm: index % 2 === 0 ? "treatment" as const : "control" as const })),
  );
}

function seededOrder(value: string) { return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16); }

/**
 * Recompute the difference-in-differences result for an experiment from its
 * baseline + latest retest wave observations, and persist it.
 * Returns null when the experiment lacks both a baseline and a retest wave.
 */
export async function computeExperimentResult(experimentId: string) {
  const prisma = getPrisma();
  const experiment = await prisma.cognitionExperiment.findUnique({
    where: { id: experimentId },
    include: { assignments: true, waves: { include: { observations: true }, orderBy: { measuredAt: "asc" } } },
  });
  if (!experiment) return null;

  const baselineWave = experiment.waves.find((wave) => wave.waveType === "baseline");
  const retestWaves = experiment.waves.filter((wave) => wave.waveType === "retest");
  const latestRetest = retestWaves[retestWaves.length - 1];
  if (!baselineWave || !latestRetest) return null;

  const treatmentPre = armProportion(baselineWave.observations, "treatment");
  const treatmentPost = armProportion(latestRetest.observations, "treatment");
  const controlPre = armProportion(baselineWave.observations, "control");
  const controlPost = armProportion(latestRetest.observations, "control");

  const clustered = await computeQuestionLevelResult(experiment, baselineWave.runId, latestRetest.runId);
  const did = clustered ?? differenceInDifferences({ treatmentPre, treatmentPost, controlPre, controlPost });
  const protocol = isRecord(experiment.protocol) ? experiment.protocol : {};
  const confirmatory = protocol.confirmatory === true;
  const treatmentQuestions = experiment.assignments?.filter((item: { arm: ExperimentArm }) => item.arm === "treatment").length ?? 0;
  const controlQuestions = experiment.assignments?.filter((item: { arm: ExperimentArm }) => item.arm === "control").length ?? 0;
  const requiredPerArm = requiredQuestionsPerArm(0.5, 0.15, 0.05, 0.8);
  const minimumPerArm = confirmatory ? requiredPerArm : 10;
  const modelConfigStable = clustered?.modelConfigStable ?? false;
  const failureRate = clustered?.failureRate ?? 1;
  const protocolQualified = experiment.preregistered && treatmentQuestions >= minimumPerArm && controlQuestions >= minimumPerArm && modelConfigStable && failureRate <= 0.1;
  const resultGrade = protocolQualified ? (confirmatory ? "CONFIRMATORY" : "CORROBORATED") : "DIRECTIONAL";

  const result = await prisma.experimentResult.create({
    data: {
      experimentId,
      metricKey: experiment.metricKey,
      treatmentPreRate: did.treatmentPreRate,
      treatmentPostRate: did.treatmentPostRate,
      controlPreRate: did.controlPreRate,
      controlPostRate: did.controlPostRate,
      treatmentDelta: did.treatmentDelta,
      controlDelta: did.controlDelta,
      netLift: did.netLift,
      zScore: did.z,
      pValue: did.pValue,
      significant: did.significant,
      confidenceLower: clustered?.confidenceLower,
      confidenceUpper: clustered?.confidenceUpper,
      evidenceGrade: resultGrade,
      metadata: {
        baselineWaveId: baselineWave.id,
        retestWaveId: latestRetest.id,
        metricKey: experiment.metricKey,
        baselineMeasuredAt: baselineWave.measuredAt.toISOString(),
        retestMeasuredAt: latestRetest.measuredAt.toISOString(),
        analysisUnit: clustered ? "question" : "aggregate_legacy_fallback",
        bootstrapIterations: clustered?.iterations ?? 0,
        randomizationPValue: clustered?.pValue ?? null,
        assignmentSeed: experiment.assignmentSeed,
        preregistered: experiment.preregistered,
        confirmatory,
        requiredQuestionsPerArm: minimumPerArm,
        treatmentQuestions,
        controlQuestions,
        modelConfigStable,
        failureRate,
        protocolQualified,
        limitations: protocolQualified ? [] : ["Result is directional because one or more protocol gates were not met."],
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.evidenceClaim.deleteMany({
    where: { links: { some: { experimentResult: { experimentId } } } },
  });
  await prisma.evidenceClaim.create({
    data: {
      projectId: experiment.projectId,
      claimType: "EXPERIMENT",
      supportStatus: protocolQualified ? "SUPPORTED" : "INSUFFICIENT",
      evidenceGrade: resultGrade,
      statement: `The quasi-experimental estimate for ${experiment.metricKey} was ${(did.netLift * 100).toFixed(1)} percentage points.`,
      methodVersion: "2026-09-09.clustered-did.v1",
      supportingCount: did.netLift > 0 ? 1 : 0,
      opposingCount: did.netLift < 0 ? 1 : 0,
      uncertainCount: protocolQualified ? 0 : 1,
      metadata: {
        experimentId,
        protocolQualified,
        confidenceLower: clustered?.confidenceLower ?? null,
        confidenceUpper: clustered?.confidenceUpper ?? null,
        pValue: did.pValue,
        limitations: protocolQualified ? [] : ["Directional result; one or more preregistered protocol gates were not met."],
      } as Prisma.InputJsonValue,
      links: {
        create: {
          experimentResultId: result.id,
          relation: protocolQualified ? "SUPPORTS" : "UNCERTAIN",
          excerpt: `Difference-in-differences ${(did.netLift * 100).toFixed(1)}pp; p=${did.pValue.toFixed(4)}.`,
        },
      },
    },
  });
  return result;
}

function armProportion(observations: Array<{ arm: ExperimentArm; samples: number; successes: number }>, arm: ExperimentArm): ArmProportion {
  const found = observations.find((observation) => observation.arm === arm);
  return { successes: found?.successes ?? 0, samples: found?.samples ?? 0 };
}

export type ExperimentSummary = {
  id: string;
  name: string;
  hypothesis: string | null;
  metricKey: string;
  status: string;
  result: DifferenceInDifferences | null;
  computedAt: string | null;
  treatmentSamples: number;
  controlSamples: number;
  hasBaseline: boolean;
  hasRetest: boolean;
  evidenceGrade: "INSUFFICIENT" | "DIRECTIONAL" | "CORROBORATED" | "CONFIRMATORY";
  confidenceLower: number | null;
  confidenceUpper: number | null;
  protocolQualified: boolean;
  limitations: string[];
};

/** Latest persisted result per experiment for a project (recomputes if stale/missing). */
export async function listExperimentSummaries(projectId: string): Promise<ExperimentSummary[]> {
  const prisma = getPrisma();
  const experiments = await prisma.cognitionExperiment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      results: { orderBy: { computedAt: "desc" }, take: 1 },
      waves: { include: { observations: true } },
    },
  });

  return experiments.map((experiment) => {
    const result = experiment.results[0] ?? null;
    // If we have the waves but no persisted result yet, compute in-memory so the
    // page is never blank (persistence happens on the next explicit recompute).
    if (!result) {
      const baseline = experiment.waves.find((wave) => wave.waveType === "baseline");
      const retests = experiment.waves.filter((wave) => wave.waveType === "retest");
      const latestRetest = retests[retests.length - 1];
      if (baseline && latestRetest) {
        const did = differenceInDifferences({
          treatmentPre: armProportion(baseline.observations, "treatment"),
          treatmentPost: armProportion(latestRetest.observations, "treatment"),
          controlPre: armProportion(baseline.observations, "control"),
          controlPost: armProportion(latestRetest.observations, "control"),
        });
        computeExperimentResult(experiment.id).catch(() => null);
        return toSummary(experiment, did, null);
      }
    }
    return toSummary(experiment, result ? resultToDid(result) : null, result?.computedAt.toISOString() ?? null, result);
  });
}

export async function getExperimentDetail(experimentId: string) {
  return getPrisma().cognitionExperiment.findUnique({
    where: { id: experimentId },
    include: {
      assignments: { include: { query: true }, orderBy: { createdAt: "asc" } },
      waves: { include: { observations: true, run: true }, orderBy: { measuredAt: "asc" } },
      results: { orderBy: { computedAt: "desc" }, take: 5 },
    },
  });
}

export async function finalizeExperimentWavesForRun(runId: string) {
  const prisma = getPrisma();
  const waves = await prisma.experimentWave.findMany({
    where: { runId },
    include: {
      experiment: { include: { assignments: true } },
    },
  });
  if (waves.length === 0) return [];

  const responses = await prisma.aIResponse.findMany({
    where: { runId },
    include: {
      analysis: true,
      citationSources: true,
      probeResults: {
        where: { probeFamily: "answer_extraction" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const waveSummaries: Array<{ waveId: string; experimentId: string }> = [];
  const experimentIds = new Set<string>();

  for (const wave of waves) {
    const armObservations = aggregateWaveObservations({
      metricKey: wave.experiment.metricKey,
      assignments: wave.experiment.assignments,
      responses,
    });
    for (const observation of armObservations) {
      await prisma.experimentObservation.upsert({
        where: { waveId_arm: { waveId: wave.id, arm: observation.arm } },
        update: { samples: observation.samples, successes: observation.successes },
        create: {
          waveId: wave.id,
          arm: observation.arm,
          samples: observation.samples,
          successes: observation.successes,
        },
      });
    }
    await prisma.cognitionExperiment.update({
      where: { id: wave.experimentId },
      data: { status: wave.waveType === "baseline" ? "running" : "concluded" },
    });
    waveSummaries.push({ waveId: wave.id, experimentId: wave.experimentId });
    experimentIds.add(wave.experimentId);
  }

  // Compute result once per unique experiment after all observations are persisted.
  const resultMap = new Map<string, Awaited<ReturnType<typeof computeExperimentResult>>>();
  for (const experimentId of experimentIds) {
    resultMap.set(experimentId, await computeExperimentResult(experimentId));
  }

  return waveSummaries.map(({ waveId, experimentId }) => ({
    waveId,
    experimentId,
    result: resultMap.get(experimentId) ?? null,
  }));
}

export function aggregateWaveObservations(input: {
  metricKey: string;
  assignments: Array<{ queryId: string; arm: ExperimentArm }>;
  responses: Array<ResponseForMetric>;
}) {
  const armByQuery = new Map(input.assignments.map((assignment) => [assignment.queryId, assignment.arm]));
  const buckets: Record<ExperimentArm, { samples: number; successes: number }> = {
    treatment: { samples: 0, successes: 0 },
    control: { samples: 0, successes: 0 },
  };

  for (const response of input.responses) {
    const arm = armByQuery.get(response.queryId);
    if (!arm) continue;
    buckets[arm].samples += 1;
    if (responseSucceeded(input.metricKey, response)) {
      buckets[arm].successes += 1;
    }
  }

  return (["treatment", "control"] as const).map((arm) => ({
    arm,
    samples: buckets[arm].samples,
    successes: buckets[arm].successes,
  }));
}

function toSummary(
  experiment: {
    id: string;
    name: string;
    hypothesis: string | null;
    metricKey: string;
    status: string;
    waves: Array<{ waveType: ExperimentWaveType; observations: Array<{ arm: ExperimentArm; samples: number }> }>;
  },
  result: DifferenceInDifferences | null,
  computedAt: string | null,
  persisted?: { evidenceGrade: string; confidenceLower: number | null; confidenceUpper: number | null; metadata: unknown } | null,
): ExperimentSummary {
  const treatmentSamples = sumArmSamples(experiment.waves, "treatment");
  const controlSamples = sumArmSamples(experiment.waves, "control");
  return {
    id: experiment.id,
    name: experiment.name,
    hypothesis: experiment.hypothesis,
    metricKey: experiment.metricKey,
    status: experiment.status,
    result,
    computedAt,
    treatmentSamples,
    controlSamples,
    hasBaseline: experiment.waves.some((wave) => wave.waveType === "baseline"),
    hasRetest: experiment.waves.some((wave) => wave.waveType === "retest"),
    evidenceGrade: (persisted?.evidenceGrade as ExperimentSummary["evidenceGrade"]) ?? "DIRECTIONAL",
    confidenceLower: persisted?.confidenceLower ?? null,
    confidenceUpper: persisted?.confidenceUpper ?? null,
    protocolQualified: asBoolean(persisted?.metadata, "protocolQualified"),
    limitations: asStringArray(persisted?.metadata, "limitations"),
  };
}

function asBoolean(value: unknown, key: string) { return isRecord(value) && value[key] === true; }
function asStringArray(value: unknown, key: string) { return isRecord(value) && Array.isArray(value[key]) ? (value[key] as unknown[]).filter((item): item is string => typeof item === "string") : []; }

function sumArmSamples(waves: Array<{ observations: Array<{ arm: ExperimentArm; samples: number }> }>, arm: ExperimentArm): number {
  return waves.reduce((total, wave) => total + wave.observations.filter((o) => o.arm === arm).reduce((s, o) => s + o.samples, 0), 0);
}

async function computeQuestionLevelResult(
  experiment: { metricKey: string; assignmentSeed: string; assignments: Array<{ queryId: string; arm: ExperimentArm }> },
  baselineRunId: string | null,
  retestRunId: string | null,
) {
  if (!baselineRunId || !retestRunId) return null;
  const prisma = getPrisma();
  const include = { analysis: true, citationSources: true, probeResults: { where: { probeFamily: "answer_extraction" as const }, orderBy: { createdAt: "desc" as const }, take: 1 } };
  const [baselineRun, retestRun] = await Promise.all([
    prisma.samplingRun.findUnique({ where: { id: baselineRunId }, include: { responses: { include } } }),
    prisma.samplingRun.findUnique({ where: { id: retestRunId }, include: { responses: { include } } }),
  ]);
  if (!baselineRun || !retestRun) return null;
  const pre = ratesByQuestion(experiment.metricKey, baselineRun.responses);
  const post = ratesByQuestion(experiment.metricKey, retestRun.responses);
  const outcomes = experiment.assignments.flatMap((assignment) => pre.has(assignment.queryId) && post.has(assignment.queryId) ? [{ queryId: assignment.queryId, arm: assignment.arm, preRate: pre.get(assignment.queryId)!, postRate: post.get(assignment.queryId)! }] : []);
  if (!outcomes.some((item) => item.arm === "treatment") || !outcomes.some((item) => item.arm === "control")) return null;
  const result = clusteredDifferenceInDifferences(outcomes, { seed: experiment.assignmentSeed, iterations: 2000 });
  const expected = Math.max(1, baselineRun.sampleCount + retestRun.sampleCount);
  const completed = baselineRun.responses.length + retestRun.responses.length;
  return {
    ...result,
    modelConfigStable: modelSet(baselineRun.responses).join("|") === modelSet(retestRun.responses).join("|"),
    failureRate: Math.max(0, 1 - completed / expected),
  };
}

function ratesByQuestion(metricKey: string, responses: ResponseForMetric[]) {
  const buckets = new Map<string, { total: number; successes: number }>();
  for (const response of responses) {
    const bucket = buckets.get(response.queryId) ?? { total: 0, successes: 0 };
    bucket.total += 1;
    if (responseSucceeded(metricKey, response)) bucket.successes += 1;
    buckets.set(response.queryId, bucket);
  }
  return new Map([...buckets].map(([queryId, bucket]) => [queryId, bucket.successes / bucket.total]));
}

function modelSet(responses: Array<{ providerId: string | null; modelId: string | null; model: string }>) {
  return [...new Set(responses.map((item) => `${item.providerId ?? "provider"}:${item.modelId ?? item.model}`))].sort();
}

function resultToDid(result: {
  treatmentPreRate: number;
  treatmentPostRate: number;
  controlPreRate: number;
  controlPostRate: number;
  treatmentDelta: number;
  controlDelta: number;
  netLift: number;
  zScore: number;
  pValue: number;
  significant: boolean;
}): DifferenceInDifferences {
  return {
    treatmentPreRate: result.treatmentPreRate,
    treatmentPostRate: result.treatmentPostRate,
    controlPreRate: result.controlPreRate,
    controlPostRate: result.controlPostRate,
    treatmentDelta: result.treatmentDelta,
    controlDelta: result.controlDelta,
    netLift: result.netLift,
    z: result.zScore,
    pValue: result.pValue,
    significant: result.significant,
  };
}

export async function createExperimentWaveRun(input: {
  experimentId: string;
  waveType: ExperimentWaveType;
  label?: string | null;
  sampleCountPerQuery?: number;
  queued: boolean;
  traceId: string;
}) {
  const prisma = getPrisma();
  const experiment = await prisma.cognitionExperiment.findUnique({
    where: { id: input.experimentId },
    include: { assignments: true, project: true },
  });
  if (!experiment) throw new Error("Experiment not found.");
  if (experiment.assignments.length < 2) throw new Error("Experiment has no assigned questions.");

  const selectedQueryIds = experiment.assignments.map((assignment) => assignment.queryId);
  const protocol = isRecord(experiment.protocol) ? experiment.protocol : {};
  const sampling = isRecord(protocol.sampling) ? protocol.sampling : {};
  const frozenSampleCount = typeof sampling.samplesPerQuestionPerModelPerWave === "number" ? sampling.samplesPerQuestionPerModelPerWave : 3;
  const sampleCountPerQuery = input.sampleCountPerQuery ?? frozenSampleCount;
  const baselineWave = input.waveType === "retest"
    ? await prisma.experimentWave.findFirst({ where: { experimentId: experiment.id, waveType: "baseline", runId: { not: null } }, include: { run: true }, orderBy: { measuredAt: "asc" } })
    : null;
  const baselineStrategy = isRecord(baselineWave?.run?.samplingStrategy) ? baselineWave.run.samplingStrategy : {};
  const baselineMatrix = Array.isArray(baselineStrategy.modelMatrix)
    ? baselineStrategy.modelMatrix.flatMap((value) => {
        const row = isRecord(value) ? value : {};
        return typeof row.providerId === "string" && typeof row.model === "string" && typeof row.platform === "string"
          ? [{ providerId: row.providerId, providerName: typeof row.providerName === "string" ? row.providerName : null, modelId: typeof row.modelId === "string" ? row.modelId : null, model: row.model, platform: row.platform, modelKey: typeof row.modelKey === "string" ? row.modelKey : `${row.providerId}:${row.model}` }]
          : [];
      })
    : [];
  const frozenMatrix = baselineMatrix.length ? baselineMatrix : await resolveExperimentModelMatrix(selectedQueryIds.length * sampleCountPerQuery);
  const run = await prisma.samplingRun.create({
    data: {
      projectId: experiment.projectId,
      subjectId: experiment.subjectId,
      runType: input.waveType === "baseline" ? "baseline" : "retest",
      status: input.queued ? "queued" : "draft",
      platforms: [...new Set(frozenMatrix.map((item) => item.platform))],
      sampleCountPerQuery,
      selectedQueryIds,
      sampleCount: selectedQueryIds.length * sampleCountPerQuery,
      samplingStrategy: {
        source: "cognition_experiment",
        experimentId: experiment.id,
        waveType: input.waveType,
        metricKey: experiment.metricKey,
        protocolVersion: typeof protocol.version === "string" ? protocol.version : "legacy",
        assignmentSeed: experiment.assignmentSeed,
        modelMatrix: frozenMatrix,
      },
      scheduledAt: new Date(),
      traceId: input.traceId,
    },
  });
  const wave = await prisma.experimentWave.create({
    data: {
      experimentId: experiment.id,
      waveType: input.waveType,
      label: input.label || (input.waveType === "baseline" ? "Baseline" : "Retest"),
      runId: run.id,
    },
  });
  await prisma.cognitionExperiment.update({
    where: { id: experiment.id },
    data: { status: input.waveType === "baseline" ? "running" : "measuring" },
  });
  return { experiment, run, wave };
}

async function resolveExperimentModelMatrix(workUnits: number) {
  const prisma = getPrisma();
  const plan = await resolveTaskExecutionPlan({ task: "answer_sampling", workUnits });
  return Promise.all(plan.lanes.map(async (lane) => {
    const provider = await prisma.aIProvider.findUnique({ where: { id: lane.providerId } });
    if (!provider) throw new Error("Experiment model provider is unavailable.");
    const model = await prisma.aIModel.findFirst({ where: { providerId: provider.id, OR: [{ name: lane.model }, { displayName: lane.model }] } });
    return {
      providerId: provider.id,
      providerName: provider.name,
      modelId: model?.id ?? null,
      model: model?.name ?? lane.model,
      platform: platformFromProviderType(provider.providerType),
      modelKey: modelKeyFromParts({ providerId: provider.id, modelId: model?.id, model: model?.name ?? lane.model }),
    };
  }));
}

export type OutcomeCorrelation = {
  metricKey: string;
  sourceName: string | null;
  pairedDays: number;
  sameDayCorrelation: number;
  lag: LaggedCorrelation;
  series: Array<{ date: string; visibility: number; outcome: number }>;
};

/**
 * Pair the project's AI-visibility series (MetricSnapshot.aiVisibilityScore by
 * day) with an imported business-outcome series and report correlation + the
 * lag at which cognition best leads the outcome.
 */
export async function computeVisibilityOutcomeCorrelation(projectId: string, metricKey: string): Promise<OutcomeCorrelation | null> {
  const prisma = getPrisma();
  const [snapshots, points, source] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { projectId, aiVisibilityScore: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { aiVisibilityScore: true, createdAt: true },
    }),
    prisma.externalMetricPoint.findMany({
      where: { projectId, metricKey },
      orderBy: { date: "asc" },
      select: { date: true, value: true },
    }),
    prisma.externalMetricSource.findFirst({ where: { projectId } }),
  ]);

  if (snapshots.length < 2 || points.length < 2) return null;

  // Index visibility by calendar day (last snapshot of the day wins).
  const visibilityByDay = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (snapshot.aiVisibilityScore === null) continue;
    visibilityByDay.set(dayKey(snapshot.createdAt), snapshot.aiVisibilityScore);
  }

  const series: Array<{ date: string; visibility: number; outcome: number }> = [];
  for (const point of points) {
    const key = dayKey(point.date);
    const visibility = visibilityByDay.get(key);
    if (visibility === undefined) continue;
    series.push({ date: key, visibility, outcome: point.value });
  }
  if (series.length < 2) return null;

  const xs = series.map((item) => item.visibility);
  const ys = series.map((item) => item.outcome);

  return {
    metricKey,
    sourceName: source?.name ?? null,
    pairedDays: series.length,
    sameDayCorrelation: pearson(xs, ys),
    lag: laggedCorrelation(xs, ys, Math.min(7, series.length - 2)),
    series,
  };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type ResponseForMetric = {
  queryId: string;
  analysis: { brandMentioned: boolean; brandRecommended: boolean } | null;
  citationSources: Array<{ supportsBrand: boolean }>;
  probeResults: Array<{ normalizedJson: unknown }>;
};

function responseSucceeded(metricKey: string, response: ResponseForMetric) {
  const normalizedKey = metricKey.replaceAll("_", "").toLowerCase();
  if (normalizedKey === "mentionrate" || normalizedKey === "recognition") return targetMentioned(response);
  if (normalizedKey === "recommendationshare") return targetRecommended(response);
  if (normalizedKey === "citationrate") return targetCited(response);
  if (normalizedKey === "authority") return scoreFromNormalized(response, ["entityProfile", "authorityScore"]) >= 0.75;
  if (normalizedKey === "featureaccuracy") return scoreFromNormalized(response, ["entityAccuracy", "featureAccuracy"]) >= 0.75;
  if (normalizedKey === "factualaccuracy" || normalizedKey === "accuracy") {
    return scoreFromNormalized(response, ["entityAccuracy", "factualAccuracy"]) >= 0.75;
  }
  return targetMentioned(response);
}

function targetMentioned(response: Pick<ResponseForMetric, "analysis" | "probeResults">) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetMentioned === "boolean") return normalized.targetMentioned;
  return Boolean(response.analysis?.brandMentioned);
}

function targetRecommended(response: Pick<ResponseForMetric, "analysis" | "probeResults">) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetRecommended === "boolean") return normalized.targetRecommended;
  return Boolean(response.analysis?.brandRecommended);
}

function targetCited(response: Pick<ResponseForMetric, "citationSources" | "probeResults">) {
  const normalized = normalizedResult(response);
  const citations = Array.isArray(normalized.citations) ? normalized.citations : [];
  if (citations.some((citation) => isRecord(citation) && citation.supportsTarget === true)) return true;
  return response.citationSources.some((source) => source.supportsBrand);
}

function scoreFromNormalized(response: Pick<ResponseForMetric, "probeResults">, path: [string, string]) {
  const parent = normalizedResult(response)[path[0]];
  if (!isRecord(parent)) return 0;
  const score = parent[path[1]];
  return typeof score === "number" && Number.isFinite(score) ? score : 0;
}

function normalizedResult(response: Pick<ResponseForMetric, "probeResults">) {
  const value = response.probeResults[0]?.normalizedJson;
  return isRecord(value) ? value : {};
}

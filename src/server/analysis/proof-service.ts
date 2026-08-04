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
import { getPrisma } from "@/server/db";
import {
  differenceInDifferences,
  laggedCorrelation,
  pearson,
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
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (queries.length < 2) {
    throw new Error("Experiment questions were not found for this project.");
  }

  const validQueryIds = queries.map((query) => query.id);
  const assignments = normalizeAssignments(validQueryIds, input.assignments);
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

function normalizeAssignments(queryIds: string[], assignments?: ExperimentAssignmentInput[]) {
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

  return queryIds.map((queryId, index) => ({
    queryId,
    arm: index % 2 === 0 ? "treatment" as const : "control" as const,
  }));
}

/**
 * Recompute the difference-in-differences result for an experiment from its
 * baseline + latest retest wave observations, and persist it.
 * Returns null when the experiment lacks both a baseline and a retest wave.
 */
export async function computeExperimentResult(experimentId: string) {
  const prisma = getPrisma();
  const experiment = await prisma.cognitionExperiment.findUnique({
    where: { id: experimentId },
    include: { waves: { include: { observations: true }, orderBy: { measuredAt: "asc" } } },
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

  const did = differenceInDifferences({ treatmentPre, treatmentPost, controlPre, controlPost });

  return prisma.experimentResult.create({
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
      metadata: {
        baselineWaveId: baselineWave.id,
        retestWaveId: latestRetest.id,
        metricKey: experiment.metricKey,
        baselineMeasuredAt: baselineWave.measuredAt.toISOString(),
        retestMeasuredAt: latestRetest.measuredAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
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
    return toSummary(experiment, result ? resultToDid(result) : null, result?.computedAt.toISOString() ?? null);
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
  };
}

function sumArmSamples(waves: Array<{ observations: Array<{ arm: ExperimentArm; samples: number }> }>, arm: ExperimentArm): number {
  return waves.reduce((total, wave) => total + wave.observations.filter((o) => o.arm === arm).reduce((s, o) => s + o.samples, 0), 0);
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
  const sampleCountPerQuery = input.sampleCountPerQuery ?? 1;
  const run = await prisma.samplingRun.create({
    data: {
      projectId: experiment.projectId,
      subjectId: experiment.subjectId,
      runType: input.waveType === "baseline" ? "baseline" : "retest",
      status: input.queued ? "queued" : "draft",
      platforms: ["openai"],
      sampleCountPerQuery,
      selectedQueryIds,
      sampleCount: selectedQueryIds.length * sampleCountPerQuery,
      samplingStrategy: {
        source: "cognition_experiment",
        experimentId: experiment.id,
        waveType: input.waveType,
        metricKey: experiment.metricKey,
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


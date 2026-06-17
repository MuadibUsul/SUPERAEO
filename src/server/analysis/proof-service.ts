/**
 * Proof service — ties the causal/correlation engine to stored data.
 *
 *  - computeExperimentResult: difference-in-differences for a treatment/control
 *    experiment, persisted as an ExperimentResult.
 *  - getProofView: everything the customer Proof page needs.
 *  - computeVisibilityOutcomeCorrelation: pairs the AI-visibility time series
 *    with an imported business-outcome series and reports correlation + lag.
 */
import type { ExperimentArm } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import {
  differenceInDifferences,
  laggedCorrelation,
  pearson,
  type DifferenceInDifferences,
  type LaggedCorrelation,
} from "@/server/analysis/causal-statistics";

type ArmProportion = { successes: number; samples: number };

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
        return toSummary(experiment, did, null);
      }
    }
    return toSummary(experiment, result ? resultToDid(result) : null, result?.computedAt.toISOString() ?? null);
  });
}

function toSummary(
  experiment: { id: string; name: string; hypothesis: string | null; metricKey: string; status: string; waves: Array<{ observations: Array<{ arm: ExperimentArm; samples: number }> }> },
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

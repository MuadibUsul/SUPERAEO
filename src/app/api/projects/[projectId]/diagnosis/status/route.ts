import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { getWorkerHealth, isWorkerVersionCompatible, WORKER_PROTOCOL_VERSION } from "@/server/queue/worker-health";
import { getAuditUsageSummary } from "@/server/ai/usage-summary";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "diagnosis", operation: "diagnosis.status" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const prisma = getPrisma();
  const [job, latestSamplingRun, latestReport, workerHealth] = await Promise.all([
    prisma.analysisJob.findFirst({
      where: { projectId, jobType: "full_diagnosis" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.samplingRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sampleCount: true, samplingStrategy: true, failureSummary: true, createdAt: true, completedAt: true },
    }),
    prisma.report.findFirst({
      where: { projectId, status: "ready" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    }),
    getWorkerHealth(),
  ]);

  const projectedProbeRunId = latestSamplingRun
    ? asRecord(latestSamplingRun.samplingStrategy).brandProbeRunId
    : undefined;
  const activeProbeRunId = probeRunIdFromJob(job?.result) ?? projectedProbeRunId;
  const latestProbeRun = await prisma.brandProbeRun.findFirst({
    where: activeProbeRunId
      ? { id: String(activeProbeRunId), projectId }
      : { projectId, configJson: { path: ["semanticExploration", "source"], equals: "full_diagnosis" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalProbes: true,
      completedProbes: true,
      failedProbes: true,
      currentStage: true,
      configJson: true,
      schedulerStatsJson: true,
      startedAt: true,
      actualThroughputPerMinute: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  const latestRun = latestProbeRun && (
    !latestSamplingRun
    || projectedProbeRunId === latestProbeRun.id
    || latestProbeRun.createdAt >= latestSamplingRun.createdAt
  )
    ? {
        id: latestProbeRun.id,
        status: latestProbeRun.status,
        sampleCount: latestProbeRun.totalProbes,
        completedProbes: latestProbeRun.completedProbes,
        failedProbes: latestProbeRun.failedProbes,
        currentStage: latestProbeRun.currentStage,
        semanticExploration: semanticExplorationSummary(latestProbeRun.configJson),
        failureSummary: latestProbeRun.failedProbes > 0 ? `${latestProbeRun.failedProbes} structured semantic probes failed.` : null,
        createdAt: latestProbeRun.createdAt,
        completedAt: latestProbeRun.finishedAt,
        runKind: "semantic_exploration",
      }
    : latestSamplingRun;

  const usageSummary = job ? await getAuditUsageSummary(projectId, job.traceId) : null;
  const executionProgress = latestProbeRun && job
    ? await buildExecutionProgress(latestProbeRun, job.traceId, usageSummary)
    : null;

  return NextResponse.json({
    job,
    latestRun,
    latestReport,
    usageSummary,
    executionProgress,
    workerAlive: isWorkerVersionCompatible(workerHealth),
    workerVersion: workerHealth.version,
    expectedWorkerVersion: WORKER_PROTOCOL_VERSION,
  });
});

async function buildExecutionProgress(
  run: {
    id: string;
    totalProbes: number;
    completedProbes: number;
    failedProbes: number;
    configJson: unknown;
    schedulerStatsJson: unknown;
    startedAt: Date | null;
    actualThroughputPerMinute: number;
  },
  traceId: string,
  usage: Awaited<ReturnType<typeof getAuditUsageSummary>>,
) {
  const prisma = getPrisma();
  const [skippedProbes, promptGroups, batchGroups] = await Promise.all([
    prisma.brandProbe.count({ where: { runId: run.id, status: "skipped" } }),
    prisma.promptRun.groupBy({
      by: ["promptName", "status", "repairAttempted"],
      where: { traceId, promptName: { in: ["brand_semantic_probe_batch", "brand_semantic_probe_single"] } },
      _count: { _all: true },
    }),
    prisma.brandProbeBatch.groupBy({
      by: ["status", "splitReason"],
      where: { runId: run.id },
      _count: { _all: true },
    }),
  ]);
  const config = asRecord(run.configJson);
  const exploration = asRecord(config.semanticExploration);
  const scheduler = asRecord(run.schedulerStatsJson);
  const initialProbeCount = numberValue(exploration.initialProbeCount, Math.min(360, run.totalProbes));
  const processed = Math.min(run.totalProbes, run.completedProbes + run.failedProbes + skippedProbes);
  const countPrompts = (name: string) => promptGroups
    .filter((group) => group.promptName === name)
    .reduce((total, group) => total + group._count._all, 0);
  const batchCalls = countPrompts("brand_semantic_probe_batch");
  const singleCalls = countPrompts("brand_semantic_probe_single");
  const repairs = promptGroups.filter((group) => group.repairAttempted).reduce((total, group) => total + group._count._all, 0);
  const batchSize = numberValue(scheduler.batchSize, numberValue(config.microBatchSize, 5));
  const remaining = Math.max(0, run.totalProbes - processed);
  const actualCalls = batchCalls + singleCalls + repairs;
  const estimatedCalls = actualCalls + Math.ceil(remaining / Math.max(1, batchSize));
  const elapsedSeconds = run.startedAt ? Math.max(0, Math.round((Date.now() - run.startedAt.getTime()) / 1000)) : 0;
  const observedRate = run.actualThroughputPerMinute > 0
    ? run.actualThroughputPerMinute
    : processed > 0 && elapsedSeconds > 0 ? processed / elapsedSeconds * 60 : 0;
  const estimatedRemainingSeconds = observedRate > 0 ? Math.ceil(remaining / observedRate * 60) : null;
  const estimatedFinalCostUsd = processed > 0
    ? (usage?.estimatedCostUsd ?? 0) + (usage?.estimatedCostUsd ?? 0) / processed * remaining
    : null;
  return {
    probes: {
      total: run.totalProbes,
      completed: run.completedProbes,
      failed: run.failedProbes,
      skipped: skippedProbes,
      remaining,
    },
    requests: {
      batch: batchCalls,
      single: singleCalls,
      repairs,
      repairTokens: usage?.repairTokens ?? 0,
      usageBreakdownAvailable: usage?.usageBreakdownAvailable ?? false,
      failed: usage?.failedRequestCount ?? 0,
      splitBatches: batchGroups.filter((group) => group.splitReason === "batch_json_failed_split_to_single").reduce((total, group) => total + group._count._all, 0),
      actual: actualCalls,
      estimated: estimatedCalls,
    },
    exploration: {
      mode: "bounded_adaptive",
      iteration: Array.isArray(exploration.history) ? exploration.history.length : 0,
      maxIterations: numberValue(exploration.maxIterations, 5),
      initialProbeCount,
      addedProbes: Math.max(0, run.totalProbes - initialProbeCount),
      maxAdditionalProbes: numberValue(exploration.maxAdditionalProbes, 64),
      stopReason: typeof exploration.stopReason === "string" ? exploration.stopReason : null,
    },
    budget: {
      tokensUsed: usage?.totalTokens ?? 0,
      tokenLimit: numberValue(exploration.maxTokens, 1_000_000),
      estimatedCostUsd: usage?.estimatedCostUsd ?? 0,
      costLimitUsd: numberValue(exploration.maxCost, 2),
      estimatedFinalCostUsd,
    },
    scheduler: {
      concurrency: numberValue(scheduler.concurrency, 0),
      batchSize: numberValue(scheduler.batchSize, 0),
      throttleReason: typeof scheduler.throttleReason === "string" ? scheduler.throttleReason : null,
    },
    timing: { elapsedSeconds, estimatedRemainingSeconds },
  };
}

function probeRunIdFromJob(value: unknown) {
  const history = asRecord(value).stageHistory;
  if (!Array.isArray(history)) return undefined;
  for (const entry of [...history].reverse()) {
    const id = asRecord(asRecord(entry).metadata).brandProbeRunId;
    if (typeof id === "string") return id;
  }
  return undefined;
}

function semanticExplorationSummary(value: unknown) {
  const config = asRecord(value);
  const exploration = asRecord(config.semanticExploration);
  const history = Array.isArray(exploration.history) ? exploration.history : [];
  return {
    enabled: exploration.enabled === true,
    iterations: history.length,
    stopReason: typeof exploration.stopReason === "string" ? exploration.stopReason : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

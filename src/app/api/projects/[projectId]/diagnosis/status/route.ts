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
  const [job, latestSamplingRun, latestProbeRun, latestReport, workerHealth] = await Promise.all([
    prisma.analysisJob.findFirst({
      where: { projectId, jobType: "full_diagnosis" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.samplingRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sampleCount: true, samplingStrategy: true, failureSummary: true, createdAt: true, completedAt: true },
    }),
    prisma.brandProbeRun.findFirst({
      where: {
        projectId,
        configJson: { path: ["semanticExploration", "source"], equals: "full_diagnosis" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalProbes: true,
        completedProbes: true,
        failedProbes: true,
        currentStage: true,
        configJson: true,
        createdAt: true,
        finishedAt: true,
      },
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

  return NextResponse.json({
    job,
    latestRun,
    latestReport,
    usageSummary,
    workerAlive: isWorkerVersionCompatible(workerHealth),
    workerVersion: workerHealth.version,
    expectedWorkerVersion: WORKER_PROTOCOL_VERSION,
  });
});

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

import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { recordTraceEvent } from "@/server/observability/event-log";

type Context = { params: Promise<{ projectId: string }> };

export const POST = withApiTrace<Context>({ subsystem: "diagnosis", operation: "diagnosis.stop_sampling" }, async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const prisma = getPrisma();
  const job = await prisma.analysisJob.findFirst({
    where: { projectId, jobType: "full_diagnosis", status: { in: ["queued", "running", "retrying"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!job) return NextResponse.json({ error: "No active audit sampling job." }, { status: 409 });

  const runId = probeRunIdFromJob(job.result);
  const run = await prisma.brandProbeRun.findFirst({
    where: runId ? { id: runId, projectId } : { projectId, analysisJobId: job.id, status: "running" },
    orderBy: { createdAt: "desc" },
  });
  if (!run || run.status !== "running") return NextResponse.json({ error: "Sampling is no longer running." }, { status: 409 });

  const config = asRecord(run.configJson);
  const exploration = asRecord(config.semanticExploration);
  const stopRequestedAt = new Date().toISOString();
  await prisma.brandProbeRun.update({
    where: { id: run.id },
    data: {
      configJson: {
        ...config,
        semanticExploration: { ...exploration, stopRequestedAt },
      } as Prisma.InputJsonValue,
      throttleReason: "manual_stop_requested",
    },
  });
  await recordTraceEvent({
    traceId: job.traceId,
    severity: "warn",
    eventType: "brand_probe.manual_stop_requested",
    subsystem: "brand_probe",
    operation: "brand_probe_sampling",
    status: "stopping",
    projectId,
    analysisJobId: job.id,
    objectType: "BrandProbeRun",
    objectId: run.id,
    metadata: { stopRequestedAt, continueToAnalysis: true },
  });

  return NextResponse.json({ accepted: true, runId: run.id, stopRequestedAt, continueToAnalysis: true });
});

function probeRunIdFromJob(value: unknown) {
  const history = asRecord(value).stageHistory;
  if (!Array.isArray(history)) return undefined;
  for (const entry of [...history].reverse()) {
    const id = asRecord(asRecord(entry).metadata).brandProbeRunId;
    if (typeof id === "string") return id;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

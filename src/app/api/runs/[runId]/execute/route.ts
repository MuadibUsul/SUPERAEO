import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { projectAccessWhere } from "@/server/auth/organizations";
import { requireApiSession } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";
import { executeSamplingRun } from "@/server/sampling/execute-run";

type Context = {
  params: Promise<{ runId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "sampling", operation: "runs.execute" }, async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { runId } = await params;
  const prisma = getPrisma();
  const run = await prisma.samplingRun.findFirst({
    where: {
      id: runId,
      project: projectAccessWhere(auth.session),
    },
    include: { project: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Sampling run not found." }, { status: 404 });
  }

  if (run.status === "running") {
    return NextResponse.json({ error: "Sampling run is already running." }, { status: 409 });
  }

  if (!isRedisConfigured()) {
    const executedRun = await executeSamplingRun(run.id, auth.session.user.id);
    return NextResponse.json({
      runId: executedRun.id,
      status: executedRun.status,
      queued: false,
      redisQueued: false,
    });
  }

  const traceId = run.traceId ?? randomUUID();
  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().samplingRun,
    jobType: "sampling_run",
    projectId: run.projectId,
    runId: run.id,
    traceId,
    payload: {
      jobId: run.queueJobId ?? run.id,
      projectId: run.projectId,
      runId: run.id,
      organizationId: run.project.organizationId,
      requestedByUserId: auth.session.user.id,
      providerId: null,
      samplingStrategy: run.samplingStrategy,
      traceId,
    },
  });

  const updatedRun = await prisma.samplingRun.update({
    where: { id: run.id },
    data: {
      status: "queued",
      queueJobId: job.queueJobId ?? job.analysisJob.id,
      traceId,
    },
  });

  return NextResponse.json({
    runId: updatedRun.id,
    status: updatedRun.status,
    queued: true,
    redisQueued: job.redisQueued,
    jobId: job.analysisJob.id,
  });
});

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireApiSession } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";
import { createRunRequestSchema } from "@/server/validation/workflow";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "sampling", operation: "runs.list" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured.", runs: [] }, { status: 503 });
  }

  const { projectId } = await params;
  const projectState = await getProject(projectId, auth.session);

  if (projectState.status !== "ready" || !projectState.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const runs = await getPrisma().samplingRun.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true, metrics: true } } },
  });

  return NextResponse.json({ runs });
});

export const POST = withApiTrace<Context>({ subsystem: "sampling", operation: "runs.create" }, async function POST(request: Request, { params }: Context) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { projectId } = await params;
  const projectState = await getProject(projectId, auth.session);

  if (projectState.status !== "ready" || !projectState.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = createRunRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid run payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const prisma = getPrisma();
  const subject = await ensurePrimaryProjectSubject(projectState.data);
  const queryIds =
    parsed.data.queryIds.length > 0
      ? parsed.data.queryIds
      : (
          await prisma.aeoQuery.findMany({
            where: { projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] },
            select: { id: true },
            orderBy: { createdAt: "asc" },
          })
        ).map((query) => query.id);

  if (queryIds.length === 0) {
    return NextResponse.json(
      { error: "Generate buyer-intent queries before creating a sampling run." },
      { status: 409 },
    );
  }

  const run = await prisma.samplingRun.create({
    data: {
      projectId,
      subjectId: subject.id,
      runType: parsed.data.runType,
      status: isRedisConfigured() ? "queued" : "draft",
      platforms: parsed.data.platforms,
      sampleCountPerQuery: parsed.data.sampleCountPerQuery,
      selectedQueryIds: queryIds,
      sampleCount: queryIds.length * parsed.data.sampleCountPerQuery,
      samplingStrategy: parsed.data.samplingStrategy ?? {
        personas: ["buyer"],
        regions: ["US"],
        contextModes: ["cold_start"],
        routingTier: "low_cost_sampling",
      },
      scheduledAt: new Date(),
      traceId: randomUUID(),
    },
  });

  const traceId = run.traceId ?? randomUUID();
  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().samplingRun,
    jobType: "sampling_run",
    projectId,
    runId: run.id,
    traceId,
    payload: {
      jobId: run.id,
      projectId,
      runId: run.id,
      organizationId: projectState.data.organizationId,
      subjectId: subject.id,
      requestedByUserId: auth.session.user.id,
      samplingStrategy: run.samplingStrategy,
      traceId,
    },
  });

  const updatedRun = await prisma.samplingRun.update({
    where: { id: run.id },
    data: { queueJobId: job.queueJobId ?? job.analysisJob.id, traceId },
  });

  return NextResponse.json({ run: updatedRun, job: job.analysisJob }, { status: 201 });
});

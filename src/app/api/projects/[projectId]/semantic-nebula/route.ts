import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { buildSemanticNebulaSnapshots, getLatestSemanticNebulaSnapshots } from "@/server/semantic-nebula/nebula-service";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "semantic_nebula", operation: "semantic_nebula.get" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const snapshots = await getLatestSemanticNebulaSnapshots({ projectId });
  const latestJob = await getPrisma().analysisJob.findFirst({
    where: { projectId, jobType: "semantic_nebula_build" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ snapshots, latestJob });
});

export const POST = withApiTrace<Context>({ subsystem: "semantic_nebula", operation: "semantic_nebula.build" }, async function POST(_request: Request, { params }: Context) {
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
  if (project.data._count.runs === 0) {
    return NextResponse.json({ error: "Complete at least one sampling run before building semantic nebula." }, { status: 409 });
  }

  const subject = await ensurePrimaryProjectSubject(project.data);
  const traceId = randomUUID();
  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().semanticIntelligence,
    jobType: "semantic_nebula_build",
    projectId,
    traceId,
    payload: {
      projectId,
      subjectId: subject.id,
      requestedByUserId: auth.session.user.id,
      traceId,
    },
  });

  if (isRedisConfigured()) {
    return NextResponse.json({ job: job.analysisJob, queued: true, redisQueued: job.redisQueued }, { status: 202 });
  }

  try {
    const snapshots = await buildSemanticNebulaSnapshots({
      projectId,
      subjectId: subject.id,
      analysisJobId: job.analysisJob.id,
    });
    const completedJob = await getPrisma().analysisJob.update({
      where: { id: job.analysisJob.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: { snapshotIds: snapshots.map((snapshot) => snapshot.id) },
      },
    });
    return NextResponse.json({ snapshots, job: completedJob, queued: false }, { status: 201 });
  } catch (error) {
    await getPrisma().analysisJob.update({
      where: { id: job.analysisJob.id },
      data: { status: "failed", completedAt: new Date(), error: error instanceof Error ? error.message : "Semantic nebula build failed." },
    });
    throw error;
  }
});

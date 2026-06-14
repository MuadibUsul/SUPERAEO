import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import {
  buildQuestionTerritorySnapshot,
  getLatestQuestionTerritorySnapshot,
} from "@/server/opportunity/opportunity-service";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "question_territory", operation: "question_territory.get" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [snapshot, latestJob] = await Promise.all([
    getLatestQuestionTerritorySnapshot(projectId),
    getPrisma().analysisJob.findFirst({
      where: { projectId, jobType: "question_territory_build" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ snapshot, latestJob });
});

export const POST = withApiTrace<Context>({ subsystem: "question_territory", operation: "question_territory.build" }, async function POST(_request: Request, context: Context) {
  return buildQuestionTerritoryResponse(context);
});

export async function buildQuestionTerritoryResponse({ params }: Context) {
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

  const subject = await ensurePrimaryProjectSubject(project.data);
  const traceId = randomUUID();
  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().semanticIntelligence,
    jobType: "question_territory_build",
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
    const snapshot = await buildQuestionTerritorySnapshot({
      projectId,
      subjectId: subject.id,
      analysisJobId: job.analysisJob.id,
    });
    const completedJob = await getPrisma().analysisJob.update({
      where: { id: job.analysisJob.id },
      data: { status: "completed", completedAt: new Date(), result: { territorySnapshotId: snapshot.id } },
    });
    return NextResponse.json({ snapshot, job: completedJob, queued: false }, { status: 201 });
  } catch (error) {
    await getPrisma().analysisJob.update({
      where: { id: job.analysisJob.id },
      data: { status: "failed", completedAt: new Date(), error: error instanceof Error ? error.message : "Question territory build failed." },
    });
    throw error;
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import {
  generateLongTailOpportunitySnapshot,
  getLatestOpportunitySnapshot,
  getLatestQuestionTerritorySnapshot,
} from "@/server/opportunity/opportunity-service";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "opportunity", operation: "opportunities.get" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const [snapshot, territorySnapshot, latestJob] = await Promise.all([
    getLatestOpportunitySnapshot(projectId),
    getLatestQuestionTerritorySnapshot(projectId),
    getPrisma().analysisJob.findFirst({
      where: { projectId, jobType: "long_tail_opportunity_generation" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ snapshot, territorySnapshot, latestJob });
});

export const POST = withApiTrace<Context>({ subsystem: "opportunity", operation: "opportunities.generate" }, async function POST(_request: Request, { params }: Context) {
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
    return NextResponse.json({ error: "Complete at least one sampling run before generating opportunities." }, { status: 409 });
  }

  const subject = await ensurePrimaryProjectSubject(project.data);
  const traceId = randomUUID();
  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().semanticIntelligence,
    jobType: "long_tail_opportunity_generation",
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
    const result = await generateLongTailOpportunitySnapshot({
      projectId,
      subjectId: subject.id,
      requestedByUserId: auth.session.user.id,
      analysisJobId: job.analysisJob.id,
    });
    const completedJob = await getPrisma().analysisJob.update({
      where: { id: job.analysisJob.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: {
          opportunitySnapshotId: result.snapshot.id,
          territorySnapshotId: result.territorySnapshot.id,
        },
      },
    });
    return NextResponse.json({ ...result, job: completedJob, queued: false }, { status: 201 });
  } catch (error) {
    await getPrisma().analysisJob.update({
      where: { id: job.analysisJob.id },
      data: { status: "failed", completedAt: new Date(), error: error instanceof Error ? error.message : "Opportunity generation failed." },
    });
    throw error;
  }
});

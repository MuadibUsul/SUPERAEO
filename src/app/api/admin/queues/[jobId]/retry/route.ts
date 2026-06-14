import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { enqueueAnalysisJob } from "@/server/queue/client";

type Context = {
  params: Promise<{ jobId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "admin", operation: "admin.queues.retry" }, async function POST(_request: Request, { params }: Context) {
  const auth = await requireAdminApiSession({ write: true });
  if (!auth.ok) return auth.response;

  const { jobId } = await params;
  const prisma = getPrisma();
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const requeued = await enqueueAnalysisJob({
    queueName: job.queueName as
      | "sampling.run"
      | "response.analyze"
      | "entity.graph.build"
      | "report.generate"
      | "semantic.intelligence",
    jobType: job.jobType,
    projectId: job.projectId ?? undefined,
    runId: job.runId ?? undefined,
    traceId: randomUUID(),
    payload: job.payload as never,
  });

  return NextResponse.json({ job: requeued.analysisJob, redisQueued: requeued.redisQueued });
});

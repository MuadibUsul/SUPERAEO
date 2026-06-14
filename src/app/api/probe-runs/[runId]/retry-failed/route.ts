import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getBrandProbeRun } from "@/server/brand-probes/brand-probe-service";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { enqueueAnalysisJob, getQueueNames } from "@/server/queue/client";

type Context = {
  params: Promise<{ runId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "brand_probe", operation: "probe_runs.retry_failed" }, async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { runId } = await params;
  const run = await getBrandProbeRun(runId, auth.session);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  await getPrisma().brandProbe.updateMany({ where: { runId, status: "failed" }, data: { status: "retrying" } });
  await getPrisma().brandProbeRun.update({
    where: { id: runId },
    data: { status: "retrying", failedProbes: 0, errorMessage: null },
  });
  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().semanticIntelligence,
    jobType: "brand_probe_run",
    projectId: run.projectId,
    payload: { projectId: run.projectId, brandProbeRunId: runId, requestedByUserId: auth.session.user.id, retryFailed: true },
    traceId: `brand_probe_run_retry:${runId}:${Date.now()}`,
  });
  return NextResponse.json({ run_id: runId, status: "retrying", redis_queued: job.redisQueued });
});

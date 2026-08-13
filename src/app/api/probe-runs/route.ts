import { NextResponse } from "next/server";
import { z } from "zod";

import { projectAccessWhere } from "@/server/auth/organizations";
import { requireApiSession } from "@/server/auth/session";
import { createBrandProbeRun } from "@/server/brand-probes/brand-probe-service";
import { enqueueAnalysisJob, getQueueNames } from "@/server/queue/client";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

const createProbeRunSchema = z.object({
  projectId: z.string().optional(),
  brand: z.object({
    name: z.string().trim().min(1),
    aliases: z.array(z.string()).optional(),
    category: z.string().optional(),
    region: z.string().optional(),
    description: z.string().optional(),
    competitors: z.array(z.string()).optional(),
    targetMarkets: z.array(z.string()).optional(),
    domain: z.string().optional(),
  }),
  mode: z.enum(["demo", "standard", "max500", "max1000"]).default("standard"),
  execution_mode: z.enum(["single", "micro_batch"]).default("micro_batch"),
  target_throughput_per_minute: z.number().int().positive().default(500),
  micro_batch_size: z.number().int().min(1).max(10).default(5),
  request_rate_limit: z.number().int().positive().default(120),
  max_concurrency: z.number().int().positive().default(24),
  tokens_per_minute_budget: z.number().int().positive().default(600000),
  model: z.string().optional(),
});

export const POST = withApiTrace({ subsystem: "brand_probe", operation: "probe_runs.create" }, async function POST(request: Request) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createProbeRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  if (parsed.data.projectId) {
    const project = await getPrisma().project.findFirst({
      where: { id: parsed.data.projectId, ...projectAccessWhere(auth.session) },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const result = await createBrandProbeRun(
    {
      projectId: parsed.data.projectId,
      brand: parsed.data.brand,
      mode: parsed.data.mode,
      executionMode: parsed.data.execution_mode,
      targetThroughputPerMinute: parsed.data.target_throughput_per_minute,
      microBatchSize: parsed.data.micro_batch_size,
      requestRateLimit: parsed.data.request_rate_limit,
      maxConcurrency: parsed.data.max_concurrency,
      tokensPerMinuteBudget: parsed.data.tokens_per_minute_budget,
      model: parsed.data.model,
    },
    auth.session,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const job = await enqueueAnalysisJob({
    queueName: getQueueNames().semanticIntelligence,
    jobType: "brand_probe_run",
    projectId: result.project.id,
    payload: {
      projectId: result.project.id,
      brandProbeRunId: result.run.id,
      requestedByUserId: auth.session.user.id,
    },
    traceId: `brand_probe_run:${result.run.id}`,
  });
  await getPrisma().brandProbeRun.update({
    where: { id: result.run.id },
    data: { analysisJobId: job.analysisJob.id },
  });

  return NextResponse.json({
    run_id: result.run.id,
    project_id: result.project.id,
    status: result.run.status,
    total_probes: result.run.totalProbes,
    target_throughput_per_minute: result.run.targetThroughputPerMinute,
    request_rate_limit: result.run.requestRateLimit,
    max_concurrency: result.run.maxConcurrency,
    micro_batch_size: result.run.microBatchSize,
    redis_queued: job.redisQueued,
  });
});

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { requireApiSession } from "@/server/auth/session";
import { platformFromProviderType } from "@/server/ai/platform";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";
import { createRunRequestSchema } from "@/server/validation/workflow";
import { modelKeyFromParts } from "@/server/metrics/cip-metrics";

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
  let modelMatrix: Awaited<ReturnType<typeof validateModelMatrix>> = [];
  try {
    modelMatrix = parsed.data.modelMatrix ? await validateModelMatrix(parsed.data.modelMatrix) : [];
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid model matrix." },
      { status: 400 },
    );
  }
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
      platforms: modelMatrix.length ? [...new Set(modelMatrix.map((item) => item.platform))] : parsed.data.platforms,
      sampleCountPerQuery: parsed.data.sampleCountPerQuery,
      selectedQueryIds: queryIds,
      sampleCount: queryIds.length * parsed.data.sampleCountPerQuery * Math.max(1, modelMatrix.length),
      samplingStrategy: {
        ...(parsed.data.samplingStrategy ?? {
          personas: ["buyer"],
          regions: ["US"],
          contextModes: ["cold_start"],
          routingTier: "low_cost_sampling",
        }),
        ...(modelMatrix.length ? { modelMatrix } : {}),
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

async function validateModelMatrix(
  items: Array<{ providerId: string; modelId?: string; model?: string }>,
) {
  if (items.length === 0) return [];

  const prisma = getPrisma();
  const providers = await prisma.aIProvider.findMany({
    where: { id: { in: items.map((item) => item.providerId) }, enabled: true },
    include: { models: { where: { enabled: true } } },
  });
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  return items.map((item) => {
    const provider = providerById.get(item.providerId);
    if (!provider) {
      throw new Error("Selected model provider is not enabled.");
    }

    const modelRecord = item.modelId
      ? provider.models.find((model) => model.id === item.modelId)
      : item.model
        ? provider.models.find((model) => model.name === item.model || model.displayName === item.model)
        : null;
    const model = modelRecord?.name ?? item.model ?? provider.defaultModel;

    if (item.modelId && !modelRecord) {
      throw new Error("Selected model is not enabled for its provider.");
    }

    if (item.model && !modelRecord && item.model !== provider.defaultModel) {
      throw new Error("Selected model name is not enabled for its provider.");
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      modelId: modelRecord?.id ?? null,
      model,
      platform: platformFromProviderType(provider.providerType),
      modelKey: modelKeyFromParts({ providerId: provider.id, modelId: modelRecord?.id, model }),
    };
  });
}


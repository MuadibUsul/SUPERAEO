import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { createExperimentWaveRun } from "@/server/analysis/proof-service";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { enqueueAnalysisJob, getQueueNames, isRedisConfigured } from "@/server/queue/client";

type Context = {
  params: Promise<{ projectId: string; experimentId: string }>;
};

const createWaveSchema = z.object({
  waveType: z.enum(["baseline", "retest"]),
  label: z.string().trim().max(120).optional(),
  sampleCountPerQuery: z.coerce.number().int().min(1).max(5).default(1),
});

export const POST = withApiTrace<Context>({ subsystem: "proof", operation: "experiments.waves.create" }, async function POST(request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId, experimentId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const experimentExists = await getPrisma().cognitionExperiment.findFirst({
    where: { id: experimentId, projectId },
    select: { id: true },
  });
  if (!experimentExists) {
    return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = createWaveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid wave payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const traceId = randomUUID();
    const created = await createExperimentWaveRun({
      experimentId,
      waveType: parsed.data.waveType,
      label: parsed.data.label,
      sampleCountPerQuery: parsed.data.sampleCountPerQuery,
      queued: isRedisConfigured(),
      traceId,
    });

    let job = null;
    if (isRedisConfigured()) {
      const queued = await enqueueAnalysisJob({
        queueName: getQueueNames().samplingRun,
        jobType: "sampling_run",
        projectId,
        runId: created.run.id,
        traceId,
        payload: {
          jobId: created.run.id,
          projectId,
          runId: created.run.id,
          organizationId: project.data.organizationId,
          subjectId: created.experiment.subjectId,
          requestedByUserId: auth.session.user.id,
          samplingStrategy: created.run.samplingStrategy,
          traceId,
        },
      });
      job = queued.analysisJob;
      created.run = await getPrisma().samplingRun.update({
        where: { id: created.run.id },
        data: { queueJobId: queued.queueJobId ?? queued.analysisJob.id, traceId },
      });
    }

    return NextResponse.json({ run: created.run, wave: created.wave, job }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Experiment wave could not be created." },
      { status: 400 },
    );
  }
});

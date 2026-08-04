import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { createCognitionExperiment, listExperimentSummaries } from "@/server/analysis/proof-service";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

const createExperimentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  hypothesis: z.string().trim().max(1000).optional(),
  metricKey: z.string().trim().min(1).max(80).optional(),
  queryIds: z.array(z.string().trim().min(1)).optional(),
  assignments: z
    .array(
      z.object({
        queryId: z.string().trim().min(1),
        arm: z.enum(["treatment", "control"]),
      }),
    )
    .optional(),
});

export const GET = withApiTrace<Context>({ subsystem: "proof", operation: "experiments.list" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ experiments: await listExperimentSummaries(projectId) });
});

export const POST = withApiTrace<Context>({ subsystem: "proof", operation: "experiments.create" }, async function POST(request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = createExperimentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid experiment payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const subject = project.data.subjects[0] ?? null;
  const queryIds = parsed.data.queryIds?.length
    ? parsed.data.queryIds
    : (
        await getPrisma().aeoQuery.findMany({
          where: { projectId, ...(subject ? { OR: [{ subjectId: subject.id }, { subjectId: null }] } : {}) },
          select: { id: true },
          orderBy: { createdAt: "asc" },
          take: 24,
        })
      ).map((query) => query.id);

  try {
    const experiment = await createCognitionExperiment({
      projectId,
      subjectId: subject?.id,
      name: parsed.data.name,
      hypothesis: parsed.data.hypothesis,
      metricKey: parsed.data.metricKey,
      queryIds,
      assignments: parsed.data.assignments,
    });
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Experiment could not be created." },
      { status: 400 },
    );
  }
});

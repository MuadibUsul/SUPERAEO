import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { computeExperimentResult, finalizeExperimentWavesForRun } from "@/server/analysis/proof-service";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string; experimentId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "proof", operation: "experiments.compute" }, async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId, experimentId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const experiment = await getPrisma().cognitionExperiment.findFirst({
    where: { id: experimentId, projectId },
    include: { waves: true },
  });
  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  }

  for (const wave of experiment.waves) {
    if (wave.runId) await finalizeExperimentWavesForRun(wave.runId);
  }
  const result = await computeExperimentResult(experimentId);
  return NextResponse.json({ result });
});

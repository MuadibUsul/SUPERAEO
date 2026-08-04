import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getExperimentDetail } from "@/server/analysis/proof-service";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string; experimentId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "proof", operation: "experiments.get" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId, experimentId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const experiment = await getExperimentDetail(experimentId);
  if (!experiment || experiment.projectId !== projectId) {
    return NextResponse.json({ error: "Experiment not found." }, { status: 404 });
  }

  return NextResponse.json({ experiment });
});

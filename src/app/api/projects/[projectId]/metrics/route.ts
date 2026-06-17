import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { buildCipMetricBundle } from "@/server/metrics/cip-metrics";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "project", operation: "projects.metrics.get" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json(await buildCipMetricBundle(projectId));
});

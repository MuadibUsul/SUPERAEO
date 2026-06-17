import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";

type CompetitorItemContext = {
  params: Promise<{ projectId: string; competitorId: string }>;
};

export const DELETE = withApiTrace<CompetitorItemContext>({ subsystem: "project", operation: "projects.competitors.delete" }, async function DELETE(
  _request: Request,
  { params }: CompetitorItemContext,
) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const { projectId, competitorId } = await params;
  const project = await getProject(projectId, auth.session);

  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await getPrisma().competitor.deleteMany({
    where: {
      id: competitorId,
      projectId,
    },
  });

  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";

import { createSemanticCoverageSnapshot } from "@/server/analysis/semantic-coverage";
import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

type Context = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const snapshot = await getPrisma().semanticCoverageSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ snapshot });
}

export async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (project.data._count.runs === 0) {
    return NextResponse.json(
      { error: "Complete at least one sampling run before generating semantic coverage." },
      { status: 409 },
    );
  }

  const snapshot = await createSemanticCoverageSnapshot(projectId);
  return NextResponse.json({ snapshot });
}

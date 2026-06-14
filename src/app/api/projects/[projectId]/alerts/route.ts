import { NextResponse } from "next/server";

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

  const alerts = await getPrisma().alert.findMany({
    where: { projectId },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      response: {
        select: { id: true, model: true, platform: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({ alerts });
}


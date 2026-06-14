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

  const profile = await getPrisma().entityProfile.findFirst({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
  });
  const edges = await getPrisma().semanticEdge.findMany({
    where: { projectId },
    orderBy: { weight: "desc" },
    take: 50,
  });

  return NextResponse.json({
    profile,
    graph: {
      nodes: [
        { id: project.data.brandName, type: "brand", label: project.data.brandName },
        ...edges.flatMap((edge) => [
          { id: edge.sourceNode, type: edge.sourceType, label: edge.sourceNode },
          { id: edge.targetNode, type: edge.targetType, label: edge.targetNode },
        ]),
      ],
      edges,
    },
  });
}


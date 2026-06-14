import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { normalizeDomain } from "@/server/utils/domain";
import { createCompetitorSchema } from "@/server/validation/projects";

type CompetitorContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, { params }: CompetitorContext) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured.", competitors: [] },
      { status: 503 },
    );
  }

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);

  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const competitors = await getPrisma().competitor.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ competitors });
}

export async function POST(request: Request, { params }: CompetitorContext) {
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

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);

  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createCompetitorSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid competitor payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const competitor = await prisma.competitor.create({
    data: {
      projectId,
      name: input.name,
      domain: input.domain ? normalizeDomain(input.domain) : null,
      category: input.category || "direct",
    },
  });

  return NextResponse.json({ competitor }, { status: 201 });
}

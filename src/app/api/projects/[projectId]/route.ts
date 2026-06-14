import { NextResponse } from "next/server";

import { canWriteCustomerData } from "@/server/auth/roles";
import { requireApiSession } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { syncPrimaryBrandSubject } from "@/server/projects/subject-service";
import { normalizeDomain } from "@/server/utils/domain";
import { updateProjectSchema } from "@/server/validation/projects";

type ProjectContext = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<ProjectContext>({ subsystem: "project", operation: "projects.get" }, async function GET(_request: Request, { params }: ProjectContext) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const { projectId } = await params;
  const state = await getProject(projectId, auth.session);

  if (state.status !== "ready") {
    return NextResponse.json(
      { error: state.message },
      { status: state.status === "not-configured" ? 503 : 500 },
    );
  }

  if (!state.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    project: state.data,
    competitors: state.data.competitors,
  });
});

export const PATCH = withApiTrace<ProjectContext>({ subsystem: "project", operation: "projects.update" }, async function PATCH(request: Request, { params }: ProjectContext) {
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
  const json = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid project payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const existing = await getProject(projectId, auth.session);

  if (existing.status !== "ready" || !existing.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: input.name,
      brandName: input.brandName,
      domain: input.domain ? normalizeDomain(input.domain) : undefined,
      industry: input.industry,
      targetMarket: input.targetMarket,
      language: input.language,
    },
  });
  await syncPrimaryBrandSubject(project, {
    entityType: input.entityType,
    subjectName: input.subjectName,
    websiteUrl: input.websiteUrl,
    category: input.category,
    market: input.market,
    desiredUnderstanding: input.desiredUnderstanding,
    language: input.language,
    comparisons: input.comparisons,
  });

  return NextResponse.json({ project });
});

export const DELETE = withApiTrace<ProjectContext>({ subsystem: "project", operation: "projects.delete" }, async function DELETE(_request: Request, { params }: ProjectContext) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!canWriteCustomerData(auth.session.role)) {
    return NextResponse.json({ error: "Project delete permission required." }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 },
    );
  }

  const { projectId } = await params;
  const existing = await getProject(projectId, auth.session);

  if (existing.status !== "ready" || !existing.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await getPrisma().project.delete({
    where: { id: projectId },
  });

  return NextResponse.json({
    ok: true,
    message: "Project deleted.",
  });
});

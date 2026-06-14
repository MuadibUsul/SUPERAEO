import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { buildCipMetricBundle } from "@/server/metrics/cip-metrics";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "report", operation: "reports.list" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const reports = await getPrisma().report.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reports });
});

export const POST = withApiTrace<Context>({ subsystem: "report", operation: "reports.create" }, async function POST(request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (project.data._count.runs === 0) {
    return NextResponse.json(
      { error: "Complete at least one sampling run before generating a report." },
      { status: 409 },
    );
  }

  const json = await request.json().catch(() => ({}));
  const title =
    typeof json.title === "string" && json.title.trim()
      ? json.title.trim()
      : `${project.data.brandName} Cognition Audit`;

  const metrics = await buildCipMetricBundle(projectId);
  const latestCoverage = await getPrisma().semanticCoverageSnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const alerts = await getPrisma().alert.findMany({
    where: { projectId },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 20,
  });
  const subject = project.data.subjects[0];
  const [semanticNebula, opportunities, questionTerritory] = subject
    ? await Promise.all([
        getPrisma().semanticNebulaSnapshot.findFirst({
          where: { projectId, subjectId: subject.id, scope: "OVERALL" },
          orderBy: { createdAt: "desc" },
        }),
        getPrisma().longTailOpportunitySnapshot.findFirst({
          where: { projectId, subjectId: subject.id },
          orderBy: { createdAt: "desc" },
        }),
        getPrisma().questionTerritorySnapshot.findFirst({
          where: { projectId, subjectId: subject.id },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [null, null, null];

  const report = await getPrisma().report.create({
    data: {
      projectId,
      runId: metrics.runId ?? undefined,
      title,
      format: json.format === "pdf" ? "pdf" : "html",
      status: "ready",
      snapshot: {
        project: {
          id: project.data.id,
          name: project.data.name,
          brandName: project.data.brandName,
          domain: project.data.domain,
        },
        metrics,
        semanticCoverage: latestCoverage,
        semanticNebula,
        opportunities,
        questionTerritory,
        alerts,
      },
      html: [
        `<h1>${title}</h1>`,
        `<p>AI Visibility Score: ${metrics.metrics.aiVisibilityScore.toFixed(2)}</p>`,
        `<h2>Semantic Nebula Summary</h2>`,
        `<p>${summarySentence(semanticNebula?.summaryJson, "Semantic nebula snapshot is ready.")}</p>`,
        `<h2>Long-tail Opportunity Summary</h2>`,
        `<p>${summarySentence(opportunities?.summaryJson, "Long-tail opportunity snapshot is ready.")}</p>`,
        `<h2>Question Territory Map</h2>`,
        `<p>${summarySentence(questionTerritory?.summaryJson, "Question territory snapshot is ready.")}</p>`,
      ].join(""),
    },
  });

  return NextResponse.json({ report }, { status: 201 });
});

function summarySentence(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const parts = Object.entries(record)
    .filter(([, item]) => typeof item === "string" || typeof item === "number")
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${String(item)}`);
  return parts.length ? parts.join(" · ") : fallback;
}

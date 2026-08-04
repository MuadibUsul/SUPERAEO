import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { buildReportSnapshot } from "@/server/report/report-snapshot";

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
  const subject = project.data.subjects[0];
  const snapshot = await buildReportSnapshot({
    projectId,
    subjectId: subject?.id,
    subjectName: subject?.displayName ?? project.data.brandName,
  });
  const visibilityScore = visibilityScoreFromSnapshot(snapshot);
  const runId = runIdFromSnapshot(snapshot);

  const report = await getPrisma().report.create({
    data: {
      projectId,
      runId: runId ?? undefined,
      title,
      format: json.format === "pdf" ? "pdf" : "html",
      status: "ready",
      snapshot,
      html: [
        `<h1>${title}</h1>`,
        `<p>AI Visibility Score: ${visibilityScore.toFixed(2)}</p>`,
        `<p>Scores and recommendations in this report are backed by the latest completed metric snapshot.</p>`,
      ].join(""),
    },
  });

  return NextResponse.json({ report }, { status: 201 });
});

function visibilityScoreFromSnapshot(snapshot: unknown) {
  const metrics = metricsRecord(snapshot);
  const inner = metrics.metrics && typeof metrics.metrics === "object" && !Array.isArray(metrics.metrics)
    ? metrics.metrics as Record<string, unknown>
    : {};
  return typeof inner.aiVisibilityScore === "number" ? inner.aiVisibilityScore : 0;
}

function runIdFromSnapshot(snapshot: unknown) {
  const metrics = metricsRecord(snapshot);
  return typeof metrics.runId === "string" ? metrics.runId : null;
}

function metricsRecord(snapshot: unknown) {
  const record = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {};
  return record.metrics && typeof record.metrics === "object" && !Array.isArray(record.metrics)
    ? record.metrics as Record<string, unknown>
    : {};
}

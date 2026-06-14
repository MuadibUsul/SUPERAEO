import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "diagnosis", operation: "diagnosis.status" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const prisma = getPrisma();
  const [job, latestRun, latestReport] = await Promise.all([
    prisma.analysisJob.findFirst({
      where: { projectId, jobType: "full_diagnosis" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.samplingRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sampleCount: true, failureSummary: true, createdAt: true, completedAt: true },
    }),
    prisma.report.findFirst({
      where: { projectId, status: "ready" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({ job, latestRun, latestReport });
});

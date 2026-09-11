import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/server/auth/session";
import { canWriteCustomerData } from "@/server/auth/roles";
import { writeAuditLog } from "@/server/audit/log";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { createReportShare } from "@/server/evidence/evidence-service";
import { signingConfigured } from "@/server/evidence/manifest";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = { params: Promise<{ projectId: string; reportId: string }> };
const schema = z.object({ days: z.coerce.number().int().min(1).max(30).default(30) });
export const POST = withApiTrace<Context>({ subsystem: "evidence", operation: "report_share.create" }, async function POST(request, { params }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!canWriteCustomerData(auth.session.role)) return NextResponse.json({ error: "Write permission required." }, { status: 403 });
  const { projectId, reportId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const report = await getPrisma().report.findFirst({ where: { id: reportId, projectId } });
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  if (!signingConfigured()) return NextResponse.json({ error: "Report signing is not configured." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid share expiry." }, { status: 400 });
  const { share, token } = await createReportShare({ reportId, days: parsed.data.days });
  await writeAuditLog({ actorUserId: auth.session.user.id, organizationId: project.data.organizationId ?? undefined, action: "report_share.created", targetType: "ReportShare", targetId: share.id, metadata: { reportId, projectId, expiresAt: share.expiresAt.toISOString() } });
  return NextResponse.json({ share: { id: share.id, expiresAt: share.expiresAt }, url: `/verify/${token}` }, { status: 201 });
});

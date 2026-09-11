import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { canWriteCustomerData } from "@/server/auth/roles";
import { writeAuditLog } from "@/server/audit/log";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = { params: Promise<{ projectId: string; reportId: string; shareId: string }> };
export const DELETE = withApiTrace<Context>({ subsystem: "evidence", operation: "report_share.revoke" }, async function DELETE(_request, { params }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!canWriteCustomerData(auth.session.role)) return NextResponse.json({ error: "Write permission required." }, { status: 403 });
  const { projectId, reportId, shareId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  const result = await getPrisma().reportShare.updateMany({ where: { id: shareId, projectId, reportId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count) await writeAuditLog({ actorUserId: auth.session.user.id, organizationId: project.data.organizationId ?? undefined, action: "report_share.revoked", targetType: "ReportShare", targetId: shareId, metadata: { reportId, projectId } });
  return result.count ? NextResponse.json({ revoked: true }) : NextResponse.json({ error: "Share not found." }, { status: 404 });
});

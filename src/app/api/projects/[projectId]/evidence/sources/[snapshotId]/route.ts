import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiSession } from "@/server/auth/session";
import { canWriteCustomerData } from "@/server/auth/roles";
import { writeAuditLog } from "@/server/audit/log";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = { params: Promise<{ projectId: string; snapshotId: string }> };
const schema = z.object({ sourceClass: z.enum(["SUBJECT_OFFICIAL", "GOVERNMENT_STANDARD", "ACADEMIC", "PROFESSIONAL_MEDIA", "COMMERCIAL", "COMMUNITY", "UNKNOWN"]), reason: z.string().trim().min(8).max(1000) });

export const PATCH = withApiTrace<Context>({ subsystem: "evidence", operation: "source_class.override" }, async function PATCH(request, { params }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  if (!canWriteCustomerData(auth.session.role)) return NextResponse.json({ error: "Write permission required." }, { status: 403 });
  const { projectId, snapshotId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Source snapshot not found." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A valid source class and reason are required." }, { status: 400 });
  const prisma = getPrisma();
  const existing = await prisma.sourceSnapshot.findFirst({ where: { id: snapshotId, projectId } });
  if (!existing) return NextResponse.json({ error: "Source snapshot not found." }, { status: 404 });
  const snapshot = await prisma.sourceSnapshot.update({ where: { id: snapshotId }, data: { sourceClass: parsed.data.sourceClass, classOverriddenBy: auth.session.user.id, classOverrideReason: parsed.data.reason, classOverriddenAt: new Date() } });
  await writeAuditLog({ actorUserId: auth.session.user.id, organizationId: project.data.organizationId ?? undefined, action: "evidence.source_class_override", targetType: "SourceSnapshot", targetId: snapshot.id, metadata: { from: existing.sourceClass, to: snapshot.sourceClass, reason: parsed.data.reason } });
  return NextResponse.json({ snapshot });
});

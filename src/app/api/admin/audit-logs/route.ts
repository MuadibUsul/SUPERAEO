import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.audit_logs.list" }, async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  const logs = await getPrisma().auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });

  return NextResponse.json({ logs });
});

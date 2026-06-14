import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.queues.list" }, async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  const jobs = await getPrisma().analysisJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      project: { select: { name: true } },
      run: { select: { id: true, status: true } },
    },
  });

  return NextResponse.json({ jobs });
});

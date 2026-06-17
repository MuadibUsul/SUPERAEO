import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.organizations.list" }, async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const organizations = await getPrisma().organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          members: true,
          projects: true,
        },
      },
    },
  });

  return NextResponse.json({ organizations });
});

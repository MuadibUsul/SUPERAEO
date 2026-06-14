import { NextResponse } from "next/server";

import { getCurrentSession } from "@/server/auth/session";
import { withApiTrace } from "@/server/observability/api-wrapper";

export const GET = withApiTrace({ subsystem: "auth", operation: "auth.me" }, async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      preferredLocale: session.user.preferredLocale,
      organizations: session.user.memberships.map((membership) => ({
        id: membership.organizationId,
        name: membership.organization.name,
        role: membership.role,
      })),
    },
  });
});

import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";

export async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const users = await getPrisma().user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      preferredLocale: true,
      createdAt: true,
      memberships: {
        include: {
          organization: {
            select: { id: true, name: true, type: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ users });
}

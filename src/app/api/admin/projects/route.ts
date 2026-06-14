import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";

export async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const projects = await getPrisma().project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
      _count: {
        select: {
          competitors: true,
          keywords: true,
          queries: true,
          runs: true,
        },
      },
    },
  });

  return NextResponse.json({ projects });
}

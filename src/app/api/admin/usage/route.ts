import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";

export async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const usage = await getPrisma().aIUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      provider: { select: { id: true, name: true, providerType: true } },
      model: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, brandName: true } },
      organization: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ usage });
}

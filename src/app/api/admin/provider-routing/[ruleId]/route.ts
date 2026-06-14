import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ ruleId: string }>;
};

export const DELETE = withApiTrace<Context>({ subsystem: "admin", operation: "admin.routing.delete" }, async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireAdminApiSession({ write: true });
  if (!auth.ok) return auth.response;

  const { ruleId } = await params;

  await getPrisma().providerRoutingRule.delete({
    where: { id: ruleId },
  });

  return NextResponse.json({ ok: true });
});

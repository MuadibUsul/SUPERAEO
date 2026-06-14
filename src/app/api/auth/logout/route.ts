import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, clearSessionCookie, hashSessionToken } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { recordTraceEvent } from "@/server/observability/event-log";

export const POST = withApiTrace({ subsystem: "auth", operation: "auth.logout" }, async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token && isDatabaseConfigured()) {
    await getPrisma().session
      .delete({ where: { tokenHash: hashSessionToken(token) } })
      .catch(() => null);
  }

  await clearSessionCookie();
  await recordTraceEvent({
    severity: "info",
    eventType: "auth.logout.succeeded",
    subsystem: "auth",
    operation: "auth.logout",
    status: "succeeded",
  });
  return NextResponse.json({ ok: true });
});

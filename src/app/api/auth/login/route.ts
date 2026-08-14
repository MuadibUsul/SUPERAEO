import { NextResponse } from "next/server";

import { verifyPassword } from "@/server/auth/password";
import { createSession, resolveSignedInDestination, setSessionCookie } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { recordTraceEvent } from "@/server/observability/event-log";
import { enforceRateLimits, requestClientIdentity } from "@/server/security/rate-limit";
import { loginSchema } from "@/server/validation/auth";

export const POST = withApiTrace({ subsystem: "auth", operation: "auth.login" }, async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid login payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  // The account bucket is keyed on the email alone so a distributed attack on
  // one account is throttled even when it arrives from many addresses.
  const blocked = await enforceRateLimits([
    { namespace: "login:ip", identity: requestClientIdentity(request), limit: 20, windowMs: 10 * 60_000 },
    { namespace: "login:account", identity: input.email.toLowerCase(), limit: 10, windowMs: 10 * 60_000 },
  ]);
  if (blocked) {
    return NextResponse.json(
      { error: blocked.unavailable ? "Authentication protection is temporarily unavailable." : "Too many login attempts." },
      { status: blocked.unavailable ? 503 : 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } },
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
    await recordTraceEvent({
      severity: "warn",
      eventType: "auth.login.failed",
      subsystem: "auth",
      operation: "auth.login",
      status: "failed",
      errorCode: "INVALID_CREDENTIALS",
      message: "Login failed.",
      metadata: { email: input.email },
    });
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const session = await createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);
  const redirectTo = await resolveSignedInDestination(
    {
      userId: user.id,
      role: user.role,
    },
    input.locale,
  );
  await recordTraceEvent({
    severity: "info",
    eventType: "auth.login.succeeded",
    subsystem: "auth",
    operation: "auth.login",
    status: "succeeded",
    userId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    redirectTo,
  });
});

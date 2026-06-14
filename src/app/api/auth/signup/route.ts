import { NextResponse } from "next/server";

import { hashPassword } from "@/server/auth/password";
import { createSession, resolveSignedInDestination, setSessionCookie } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { recordTraceEvent } from "@/server/observability/event-log";
import { slugify } from "@/server/utils/slug";
import { signupSchema } from "@/server/validation/auth";

export const POST = withApiTrace({ subsystem: "auth", operation: "auth.signup" }, async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const json = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(json);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstFieldError =
      fieldErrors.organizationName?.[0] ??
      fieldErrors.name?.[0] ??
      fieldErrors.email?.[0] ??
      fieldErrors.password?.[0];

    return NextResponse.json(
      {
        error: firstFieldError ?? "Invalid signup payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  if (existing) {
    await recordTraceEvent({
      severity: "warn",
      eventType: "auth.signup.failed",
      subsystem: "auth",
      operation: "auth.signup",
      status: "failed",
      errorCode: "EMAIL_ALREADY_REGISTERED",
      metadata: { email: input.email },
    });
    return NextResponse.json({ error: "Email is already registered." }, { status: 409 });
  }

  const defaultOrganizationName =
    input.organizationName.trim() ||
    `${input.name.trim() || input.email.split("@")[0]}'s Workspace`;
  const baseSlug = slugify(defaultOrganizationName) || "organization";
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      preferredLocale: input.locale,
      role: "customer_owner",
      memberships: {
        create: {
          role: "customer_owner",
          organization: {
            create: {
              name: defaultOrganizationName,
              slug,
              type: "customer",
              defaultLocale: input.locale,
            },
          },
        },
      },
    },
  });

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
    eventType: "auth.signup.succeeded",
    subsystem: "auth",
    operation: "auth.signup",
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

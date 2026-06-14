import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import type { Organization, OrganizationMember, User } from "@/generated/prisma/client";
import type { UserRole } from "@/generated/prisma/enums";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { isOperatorRole } from "@/server/auth/roles";
import { countAccessibleProjectsForUser } from "@/server/auth/organizations";
import { normalizeLocale, type Locale } from "@/i18n/config";
import { enrichTraceContext } from "@/server/observability/trace-context";
import { recordTraceEvent } from "@/server/observability/event-log";

export const SESSION_COOKIE = "aeo_session";
const SESSION_DAYS = 30;

export type AuthUser = User & {
  memberships: (OrganizationMember & { organization: Organization })[];
};

export type AuthSession = {
  user: AuthUser;
  activeOrganization: Organization | null;
  role: UserRole;
};

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(userId: string) {
  const prisma = getPrisma();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const prisma = getPrisma();
  let session:
    | ({
        user: AuthUser;
      } & {
        id: string;
        userId: string;
        tokenHash: string;
        expiresAt: Date;
        createdAt: Date;
      })
    | null = null;
  try {
    session = await prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          include: {
            memberships: {
              include: { organization: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
  } catch (error) {
    await recordTraceEvent({
      severity: "error",
      eventType: "auth.session.lookup_failed",
      subsystem: "auth",
      operation: "auth.session",
      status: "failed",
      error,
    });
    return null;
  }

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    }
    return null;
  }

  const authSession = {
    user: session.user,
    activeOrganization: session.user.memberships[0]?.organization ?? null,
    role: session.user.role,
  };
  enrichTraceContext({
    userId: authSession.user.id,
    organizationId: authSession.activeOrganization?.id,
  });
  return authSession;
}

export async function requirePageSession(locale: string) {
  const session = await getCurrentSession();

  if (!session) {
    redirect(`/${normalizeLocale(locale)}/login`);
  }

  return session;
}

export async function requireAdminPageSession(locale: string) {
  const session = await requirePageSession(locale);

  if (!isOperatorRole(session.role)) {
    redirect(`/${normalizeLocale(locale)}/app/projects`);
  }

  return session;
}

export async function requireApiSession() {
  const session = await getCurrentSession();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  return { ok: true as const, session };
}

export async function requireAdminApiSession({ write = false } = {}) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth;
  }

  if (!isOperatorRole(auth.session.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  if (write && !["platform_owner", "operator_admin"].includes(auth.session.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Admin write permission required." }, { status: 403 }),
    };
  }

  return auth;
}

export function destinationForRole(role: UserRole, locale: Locale) {
  return isOperatorRole(role) ? `/${locale}/admin` : `/${locale}/app/projects`;
}

export function destinationForProjectPresence(role: UserRole, locale: Locale, projectCount: number) {
  if (isOperatorRole(role)) {
    return `/${locale}/admin`;
  }

  return projectCount > 0 ? `/${locale}/app/projects` : `/${locale}/app/projects/new`;
}

export async function resolveSignedInDestination(
  input: {
    userId: string;
    role: UserRole;
    organizationIds?: string[];
  },
  locale: Locale,
) {
  const projectCount = await countAccessibleProjectsForUser(input);
  return destinationForProjectPresence(input.role, locale, projectCount);
}

import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { isDatabaseConfigured } from "@/server/db";
import { listProjects } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { createProjectForSession } from "@/server/projects/project-service";
import { createProjectSchema } from "@/server/validation/projects";
import { canCreateProject, quotaMessage } from "@/server/billing/usage-service";
import { normalizeLocale } from "@/i18n/config";

export const GET = withApiTrace({ subsystem: "project", operation: "projects.list" }, async function GET() {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const state = await listProjects(auth.session);

  if (state.status !== "ready") {
    return NextResponse.json(
      { error: state.message, projects: [] },
      { status: state.status === "not-configured" ? 503 : 500 },
    );
  }

  return NextResponse.json({ projects: state.data });
});

export const POST = withApiTrace({ subsystem: "project", operation: "projects.create" }, async function POST(request: Request) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "DATABASE_URL is not configured. Copy .env.example to .env and run the Prisma migration.",
      },
      { status: 503 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid project payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Enforce the organization's plan quota before creating another project.
  const organizationId = auth.session.user.memberships[0]?.organizationId;
  if (organizationId) {
    const quota = await canCreateProject(organizationId);
    if (!quota.allowed) {
      const locale = normalizeLocale(auth.session.user.preferredLocale ?? "en");
      return NextResponse.json(
        { error: quotaMessage(quota, locale), code: "PLAN_LIMIT_REACHED", limit: quota.limit, used: quota.used },
        { status: 402 },
      );
    }
  }

  const result = await createProjectForSession(parsed.data, auth.session);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ project: result.project }, { status: 201 });
});

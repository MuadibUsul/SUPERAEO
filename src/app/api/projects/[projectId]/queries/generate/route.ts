import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { generateQueriesRequestSchema } from "@/server/validation/workflow";
import { generateQueriesForProject } from "@/server/workflow/query-service";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "workflow", operation: "queries.generate" }, async function POST(request: Request, { params }: Context) {
  const auth = await requireApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { projectId } = await params;
  const projectState = await getProject(projectId, auth.session);

  if (projectState.status !== "ready" || !projectState.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = generateQueriesRequestSchema.safeParse(json);

  if (!parsed.success || parsed.data.minQueries > parsed.data.maxQueries) {
    return NextResponse.json({ error: "Invalid query generation range." }, { status: 400 });
  }

  try {
    const result = await generateQueriesForProject({
      projectId,
      requestedByUserId: auth.session.user.id,
      options: parsed.data,
    });

    return NextResponse.json({
      queries: result.queries,
      promptRunId: result.promptRunIds[0],
      promptRunIds: result.promptRunIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Query generation failed." },
      { status: 502 },
    );
  }
});

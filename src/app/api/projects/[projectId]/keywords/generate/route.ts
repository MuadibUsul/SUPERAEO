import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { isDatabaseConfigured } from "@/server/db";
import { getProject } from "@/server/data/projects";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { generateKeywordsRequestSchema } from "@/server/validation/workflow";
import { generateSemanticKeywordsForProject } from "@/server/workflow/keyword-service";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "workflow", operation: "keywords.generate" }, async function POST(request: Request, { params }: Context) {
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
  const parsed = generateKeywordsRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await generateSemanticKeywordsForProject({
      projectId,
      requestedByUserId: auth.session.user.id,
      optionalSeedKeywords: parsed.data.optionalSeedKeywords,
    });

    return NextResponse.json({
      keywords: result.keywords,
      promptRunId: result.promptRunIds[0],
      promptRunIds: result.promptRunIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Keyword generation failed." },
      { status: 502 },
    );
  }
});

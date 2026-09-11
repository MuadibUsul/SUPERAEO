import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = { params: Promise<{ projectId: string; claimId: string }> };
export const GET = withApiTrace<Context>({ subsystem: "evidence", operation: "evidence.detail" }, async function GET(_request, { params }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { projectId, claimId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  const claim = await getPrisma().evidenceClaim.findFirst({ where: { id: claimId, projectId }, include: { links: { include: { response: { include: { query: true, provider: { select: { name: true } } } }, citationSource: true, sourceSnapshot: true, experimentResult: true } } } });
  return claim ? NextResponse.json({ claim }, { headers: { "cache-control": "private, no-store" } }) : NextResponse.json({ error: "Evidence not found." }, { status: 404 });
});

import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = { params: Promise<{ projectId: string; responseId: string }> };
export const GET = withApiTrace<Context>({ subsystem: "evidence", operation: "responses.detail" }, async function GET(_request, { params }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { projectId, responseId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Response not found." }, { status: 404 });
  const response = await getPrisma().aIResponse.findFirst({ where: { id: responseId, run: { projectId } }, include: { query: true, provider: { select: { name: true, providerType: true } }, analysis: true, citationSources: { include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } }, probeResults: { orderBy: { createdAt: "desc" } } } });
  return response ? NextResponse.json({ response }, { headers: { "cache-control": "private, no-store" } }) : NextResponse.json({ error: "Response not found." }, { status: 404 });
});

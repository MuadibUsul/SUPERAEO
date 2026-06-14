import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { summarizeBrandProbeRun } from "@/server/brand-probes/brand-probe-service";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ runId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "brand_probe", operation: "probe_runs.get" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { runId } = await params;
  const summary = await summarizeBrandProbeRun(runId, auth.session);
  if (!summary) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json(summary);
});

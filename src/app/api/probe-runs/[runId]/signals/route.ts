import { NextResponse } from "next/server";

import { requireApiSession } from "@/server/auth/session";
import { getBrandProbeRun } from "@/server/brand-probes/brand-probe-service";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = {
  params: Promise<{ runId: string }>;
};

export const GET = withApiTrace<Context>({ subsystem: "brand_probe", operation: "probe_runs.signals" }, async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { runId } = await params;
  const run = await getBrandProbeRun(runId, auth.session);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const signals = await getPrisma().extractedSignal.findMany({
    where: { runId },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  return NextResponse.json({ run_id: runId, signals });
});

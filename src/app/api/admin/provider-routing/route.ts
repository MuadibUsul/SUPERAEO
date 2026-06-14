import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

const routingRuleSchema = z.object({
  task: z.string().trim().min(1),
  tier: z.enum(["low_cost_sampling", "mid_tier_verification", "high_fidelity_audit"]),
  providerId: z.string().trim().min(1),
  modelId: z.string().trim().optional().or(z.literal("")),
  enabled: z.boolean().default(true),
  priority: z.coerce.number().int().min(1).default(100),
  maxCostUsd: z.coerce.number().positive().optional().nullable(),
});

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.routing.list" }, async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  const rules = await getPrisma().providerRoutingRule.findMany({
    orderBy: [{ task: "asc" }, { priority: "asc" }],
    include: {
      provider: { select: { id: true, name: true, providerType: true } },
      model: { select: { id: true, name: true, displayName: true } },
    },
  });

  return NextResponse.json({ rules });
});

export const POST = withApiTrace({ subsystem: "admin", operation: "admin.routing.create" }, async function POST(request: Request) {
  const auth = await requireAdminApiSession({ write: true });
  if (!auth.ok) return auth.response;

  const json = await request.json().catch(() => null);
  const parsed = routingRuleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid routing rule payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await getPrisma().providerRoutingRule.create({
    data: {
      task: parsed.data.task,
      tier: parsed.data.tier,
      providerId: parsed.data.providerId,
      modelId: parsed.data.modelId || null,
      enabled: parsed.data.enabled,
      priority: parsed.data.priority,
      maxCostUsd: parsed.data.maxCostUsd ?? null,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
});

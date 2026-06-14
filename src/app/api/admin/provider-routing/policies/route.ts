import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

const policySchema = z.object({
  task: z.enum(["semantic_keyword_generator", "query_generator", "answer_sampling"]),
  tier: z.enum(["low_cost_sampling", "mid_tier_verification", "high_fidelity_audit"]),
  enabled: z.boolean().default(true),
  executionStrategy: z.enum(["single_lane", "sharded_parallel", "adaptive_parallel"]),
  providerSelection: z.enum(["primary_only", "round_robin", "priority_spread"]),
  laneCount: z.coerce.number().int().min(1).max(16).default(1),
  minLaneCount: z.coerce.number().int().min(1).max(16).default(1),
  maxLaneCount: z.coerce.number().int().min(1).max(16).default(4),
  targetLatencySeconds: z.coerce.number().int().min(15).max(600).default(120),
  timeoutSeconds: z.coerce.number().int().min(15).max(600).default(90),
});

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.routing.policies.list" }, async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  try {
    const policies = await getPrisma().taskExecutionPolicy.findMany({
      orderBy: { task: "asc" },
    });

    return NextResponse.json({ policies });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("task_execution_policies")
            ? "Task execution policy table is missing. Run the latest Prisma migration to persist custom concurrency settings."
            : "Execution policies could not be loaded.",
      },
      { status: 503 },
    );
  }
});

export const POST = withApiTrace({ subsystem: "admin", operation: "admin.routing.policies.upsert" }, async function POST(request: Request) {
  const auth = await requireAdminApiSession({ write: true });
  if (!auth.ok) return auth.response;

  const json = await request.json().catch(() => null);
  const parsed = policySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid execution policy payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.minLaneCount > parsed.data.maxLaneCount) {
    return NextResponse.json({ error: "Minimum lane count cannot be greater than maximum lane count." }, { status: 400 });
  }

  if (parsed.data.laneCount > parsed.data.maxLaneCount) {
    return NextResponse.json({ error: "Default lane count cannot be greater than maximum lane count." }, { status: 400 });
  }

  try {
    const policy = await getPrisma().taskExecutionPolicy.upsert({
      where: { task: parsed.data.task },
      update: parsed.data,
      create: parsed.data,
    });

    return NextResponse.json({ policy });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("task_execution_policies")
            ? "Task execution policy table is missing. Run the latest Prisma migration before saving concurrency changes."
            : "Execution policy could not be saved.",
      },
      { status: 503 },
    );
  }
});

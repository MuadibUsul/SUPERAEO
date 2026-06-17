/**
 * Operational setup for the connected DeepSeek providers:
 *   1) point their defaultModel at deepseek-chat (clean JSON, ~1/4 the output
 *      tokens of the reasoning models), and
 *   2) create round-robin routing rules across ALL enabled DeepSeek keys for the
 *      low-cost sampling tasks, so a 1000-probe run spreads load across keys
 *      instead of hammering a single one.
 *
 * Idempotent. Run: tsx scripts/setup-provider-routing.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const SAMPLING_MODEL = process.env.PROBE_DEFAULT_MODEL || "deepseek-chat";
// All low-cost-tier tasks that use round-robin selection benefit from spreading.
const LOW_COST_TASKS = ["brand_semantic_probe_sampling", "opportunity_probe_sampling", "answer_sampling"] as const;

async function main() {
  // 1) DeepSeek providers → deepseek-chat
  const deepseek = await prisma.aIProvider.findMany({
    where: { enabled: true, providerType: "openai_compatible" },
    orderBy: { createdAt: "asc" },
  });
  if (deepseek.length === 0) {
    console.log("No enabled openai_compatible (DeepSeek) providers found.");
    return;
  }
  const updated = await prisma.aIProvider.updateMany({
    where: { id: { in: deepseek.map((p) => p.id) } },
    data: { defaultModel: SAMPLING_MODEL },
  });
  console.log(`Set defaultModel=${SAMPLING_MODEL} on ${updated.count} provider(s): ${deepseek.map((p) => p.name).join(", ")}`);

  // 2) Round-robin routing rules across all DeepSeek keys for sampling tasks.
  await prisma.providerRoutingRule.deleteMany({ where: { task: { in: [...LOW_COST_TASKS] } } });
  let created = 0;
  for (const task of LOW_COST_TASKS) {
    for (let i = 0; i < deepseek.length; i += 1) {
      await prisma.providerRoutingRule.create({
        data: {
          task,
          tier: "low_cost_sampling",
          providerId: deepseek[i].id,
          modelId: null, // null → uses provider.defaultModel (deepseek-chat)
          enabled: true,
          priority: 100 + i, // distinct priority; round_robin uses the whole pool
          metadata: { note: "round-robin sampling across DeepSeek keys" },
        },
      });
      created += 1;
    }
  }
  console.log(`Created ${created} routing rules (${LOW_COST_TASKS.length} tasks × ${deepseek.length} keys).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

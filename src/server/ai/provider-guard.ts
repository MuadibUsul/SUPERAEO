import type { AIProvider } from "@/generated/prisma/client";

import { usageNumbers } from "@/server/brand-probes/token-cost";
import { getPrisma } from "@/server/db";
import { connectedControlRedis } from "@/server/redis-control";
import { enforceRateLimit } from "@/server/security/rate-limit";

/**
 * Returns {-1} when the month's counter has not been seeded yet, so the caller
 * can read the durable usage log once and seed it. Seeding inside the script is
 * not possible — the durable total lives in PostgreSQL.
 */
const RESERVE_BUDGET_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then
  return {-1, '0'}
end
local requested = tonumber(ARGV[1])
local budget = tonumber(ARGV[2])
if tonumber(current) + requested > budget then
  return {0, current}
end
local next = redis.call('INCRBYFLOAT', KEYS[1], requested)
redis.call('PEXPIRE', KEYS[1], ARGV[3])
return {1, next}
`;

export type ProviderPermit = {
  budgetKey?: string;
  model: string;
  reservedCostUsd: number;
};

/** Budget protection is unavailable. Fail closed in production, open locally. */
function budgetUnavailable(reason: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(reason);
  }
  return null;
}

export async function acquireProviderPermit(input: {
  provider: AIProvider;
  model?: string;
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
}): Promise<ProviderPermit> {
  const model = input.model ?? input.provider.defaultModel;

  if (input.provider.rateLimitPerMinute && input.provider.rateLimitPerMinute > 0) {
    const rate = await enforceRateLimit({
      namespace: "provider-rpm",
      identity: input.provider.id,
      limit: input.provider.rateLimitPerMinute,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      throw new Error(
        rate.unavailable
          ? "Provider request protection is temporarily unavailable."
          : `Provider rate limit reached. Retry in ${rate.retryAfterSeconds} seconds.`,
      );
    }
  }

  const budget = input.provider.monthlyBudget;
  if (!budget || budget <= 0) {
    if (process.env.REQUIRE_AI_PROVIDER_BUDGET === "true") {
      throw new Error(`Provider ${input.provider.name} does not have a monthly budget configured.`);
    }
    return { model, reservedCostUsd: 0 };
  }

  if (!process.env.REDIS_URL) {
    budgetUnavailable("Provider budget protection requires REDIS_URL in production.");
    return { model, reservedCostUsd: 0 };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const ttlMs = Math.max(60_000, nextMonth.getTime() - now.getTime() + 86_400_000);
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const budgetKey = `cip:provider-budget:${input.provider.id}:${monthKey}`;
  const promptTokens = Math.max(1, Math.ceil(`${input.system ?? ""}\n${input.prompt}`.length / 4));
  const completionTokens = Math.max(1, input.maxOutputTokens ?? 1024);
  const reservedCostUsd = usageNumbers({ promptTokens, completionTokens }, model).estimatedCostUsd;

  let result: [number, string];
  try {
    const redis = await connectedControlRedis();
    const reserve = () =>
      redis.eval(RESERVE_BUDGET_SCRIPT, 1, budgetKey, reservedCostUsd, budget, ttlMs) as Promise<[number, string]>;

    result = await reserve();
    if (Number(result[0]) === -1) {
      // Cold counter: seed it from the durable usage log, then retry. This DB
      // aggregate runs once per provider per month, not once per AI call.
      const stored = await getPrisma().aIUsageLog.aggregate({
        where: { providerId: input.provider.id, createdAt: { gte: monthStart } },
        _sum: { costUsd: true },
      });
      await redis.set(budgetKey, String(stored._sum.costUsd ?? 0), "PX", ttlMs, "NX");
      result = await reserve();
    }
  } catch (error) {
    console.error("Provider budget reservation failed", error);
    budgetUnavailable("Provider budget protection is temporarily unavailable.");
    return { model, reservedCostUsd: 0 };
  }

  if (Number(result[0]) !== 1) {
    throw new Error(`Provider monthly budget reached ($${Number(result[1]).toFixed(2)} / $${budget.toFixed(2)}).`);
  }

  return { budgetKey, model, reservedCostUsd };
}

export async function settleProviderPermit(permit: ProviderPermit, usage: unknown) {
  if (!permit.budgetKey) return;
  const actualCostUsd = usageNumbers(usage, permit.model).estimatedCostUsd;
  await adjustBudget(permit.budgetKey, actualCostUsd - permit.reservedCostUsd);
}

export async function releaseProviderPermit(permit: ProviderPermit) {
  if (!permit.budgetKey || permit.reservedCostUsd === 0) return;
  await adjustBudget(permit.budgetKey, -permit.reservedCostUsd);
}

async function adjustBudget(key: string, delta: number) {
  if (!process.env.REDIS_URL || Math.abs(delta) < Number.EPSILON) return;
  try {
    const redis = await connectedControlRedis();
    await redis.incrbyfloat(key, delta);
  } catch (error) {
    // The usage log remains the durable source of truth and will reseed the
    // counter on the next cache miss. Do not hide a completed provider result.
    console.error("Failed to adjust provider budget reservation", error);
  }
}

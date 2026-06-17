/**
 * Usage & quota — turns plan limits into live, enforceable numbers.
 */
import type { Locale } from "@/i18n/config";
import { getPrisma } from "@/server/db";
import { getPlan, type PlanLimits } from "@/server/billing/plans";

export type UsageMetric = {
  key: keyof PlanLimits;
  used: number;
  limit: number;
  exceeded: boolean;
};

export type OrganizationUsage = {
  organizationId: string;
  plan: ReturnType<typeof getPlan>["id"];
  planRenewsAt: string | null;
  planRenewsInDays: number | null;
  metrics: UsageMetric[];
};

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getOrganizationUsage(organizationId: string): Promise<OrganizationUsage | null> {
  const prisma = getPrisma();
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return null;

  const plan = getPlan(organization.plan);
  const monthStart = startOfMonthUtc();

  const [projects, auditsThisMonth, experiments, seats] = await Promise.all([
    prisma.project.count({ where: { organizationId } }),
    prisma.samplingRun.count({ where: { project: { organizationId }, createdAt: { gte: monthStart } } }),
    prisma.cognitionExperiment.count({ where: { project: { organizationId } } }),
    prisma.organizationMember.count({ where: { organizationId } }),
  ]);

  const used: Record<keyof PlanLimits, number> = {
    projects,
    auditsPerMonth: auditsThisMonth,
    experiments,
    seats,
  };

  const metrics: UsageMetric[] = (Object.keys(plan.limits) as Array<keyof PlanLimits>).map((key) => ({
    key,
    used: used[key],
    limit: plan.limits[key],
    exceeded: used[key] >= plan.limits[key],
  }));

  const planRenewsInDays = organization.planRenewsAt
    ? Math.max(0, Math.ceil((organization.planRenewsAt.getTime() - Date.now()) / 86400000))
    : null;

  return {
    organizationId,
    plan: plan.id,
    planRenewsAt: organization.planRenewsAt?.toISOString() ?? null,
    planRenewsInDays,
    metrics,
  };
}

export type QuotaCheck = { allowed: true } | { allowed: false; limit: number; used: number };

/** Whether the org can create another project under its plan. */
export async function canCreateProject(organizationId: string): Promise<QuotaCheck> {
  const prisma = getPrisma();
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return { allowed: true }; // fail open: don't block when org is unknown
  const limit = getPlan(organization.plan).limits.projects;
  const used = await prisma.project.count({ where: { organizationId } });
  return used >= limit ? { allowed: false, limit, used } : { allowed: true };
}

export function quotaMessage(check: Extract<QuotaCheck, { allowed: false }>, locale: Locale): string {
  return locale === "zh-CN"
    ? `已达到当前套餐的项目上限（${check.used}/${check.limit}）。升级套餐以创建更多审计项目。`
    : `You've reached your plan's project limit (${check.used}/${check.limit}). Upgrade to create more audits.`;
}

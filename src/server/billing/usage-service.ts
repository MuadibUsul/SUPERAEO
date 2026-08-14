/**
 * Usage & quota — turns plan limits into live, enforceable numbers.
 */
import type { Locale } from "@/i18n/config";
import type { Prisma } from "@/generated/prisma/client";
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

/**
 * Which audits count against the monthly allowance.
 *
 * A full-diagnosis job is the quota reservation: counting the accepted job
 * rather than the SamplingRun it eventually produces stops two concurrent
 * requests from both passing the limit before a worker picks either up.
 *
 * Jobs that failed are excluded. The customer got no audit out of them, so
 * charging a slot for our own failure would strand them until the month rolls
 * over with no way to self-serve.
 */
function consumedAuditsWhere(organizationId: string, monthStart: Date) {
  return {
    jobType: "full_diagnosis" as const,
    status: { not: "failed" as const },
    project: { organizationId },
    createdAt: { gte: monthStart },
  };
}

export async function getOrganizationUsage(organizationId: string): Promise<OrganizationUsage | null> {
  const prisma = getPrisma();
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return null;

  const plan = getPlan(organization.plan);
  const monthStart = startOfMonthUtc();

  const [projects, auditsThisMonth, experiments, seats] = await Promise.all([
    prisma.project.count({ where: { organizationId } }),
    prisma.analysisJob.count({ where: consumedAuditsWhere(organizationId, monthStart) }),
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

export type DiagnosisReservation =
  | { status: "reserved"; job: Awaited<ReturnType<typeof createDiagnosisJob>> }
  | { status: "existing"; job: Awaited<ReturnType<typeof createDiagnosisJob>> }
  | { status: "denied"; limit: number; used: number }
  | { status: "organization_missing" };

type DiagnosisReservationInput = {
  organizationId: string;
  projectId: string;
  queueName: string;
  traceId: string;
  payload: Prisma.InputJsonValue;
};

/**
 * Atomically reserves one monthly audit slot and creates its durable job.
 * The advisory transaction lock serializes requests for the same organization,
 * so two browser tabs cannot both observe the last available slot.
 */
export async function reserveDiagnosisAudit(input: DiagnosisReservationInput): Promise<DiagnosisReservation> {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtext(${`diagnosis-quota:${input.organizationId}`}))`;

    const organization = await tx.organization.findUnique({ where: { id: input.organizationId } });
    if (!organization) return { status: "organization_missing" };

    const activeJob = await tx.analysisJob.findFirst({
      where: {
        projectId: input.projectId,
        jobType: "full_diagnosis",
        status: { in: ["queued", "running", "retrying"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (activeJob) return { status: "existing", job: activeJob };

    const monthStart = startOfMonthUtc();
    const limit = getPlan(organization.plan).limits.auditsPerMonth;
    const used = await tx.analysisJob.count({
      where: consumedAuditsWhere(input.organizationId, monthStart),
    });
    if (used >= limit) return { status: "denied", limit, used };

    const job = await createDiagnosisJob(tx, input);
    return { status: "reserved", job };
  });
}

function createDiagnosisJob(
  tx: Prisma.TransactionClient,
  input: DiagnosisReservationInput,
) {
  return tx.analysisJob.create({
    data: {
      projectId: input.projectId,
      jobType: "full_diagnosis",
      queueName: input.queueName,
      traceId: input.traceId,
      payload: input.payload,
      status: "queued",
    },
  });
}

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

export function auditQuotaMessage(check: { limit: number; used: number }, locale: Locale): string {
  return locale === "zh-CN"
    ? `已达到当前套餐的每月审计上限（${check.used}/${check.limit}）。下月额度刷新后可继续审计。`
    : `You've reached your monthly audit limit (${check.used}/${check.limit}). You can run another audit after the monthly reset.`;
}

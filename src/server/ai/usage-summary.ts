import { usageNumbers } from "@/server/brand-probes/token-cost";
import { getPrisma } from "@/server/db";

export type AuditUsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  requestCount: number;
  failedRequestCount: number;
  repairCount: number;
  repairTokens: number;
  repairCostUsd: number;
  usageBreakdownAvailable: boolean;
};

export async function getAuditUsageSummary(projectId: string, traceId: string): Promise<AuditUsageSummary | null> {
  const prisma = getPrisma();
  const where = { projectId, traceId };
  const [logs, failedRequestCount, repairCount, usageRows] = await Promise.all([
    prisma.aIUsageLog.aggregate({
      where,
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true, costUsd: true },
      _count: { _all: true, costUsd: true },
    }),
    prisma.aIUsageLog.count({ where: { ...where, status: "failed" } }),
    prisma.promptRun.count({ where: { ...where, repairAttempted: true } }),
    // Rows written before cost was recorded per call. Priced from their own
    // token counts rather than discarding every sibling row's real cost.
    prisma.aIUsageLog.findMany({ where, select: { promptTokens: true, completionTokens: true, costUsd: true, metadata: true } }),
  ]);

  if (logs._count._all === 0) return null;

  const backfilledCostUsd = usageRows.filter((log) => log.costUsd === null).reduce((total, log) => {
    const model = typeof log.metadata === "object" && log.metadata !== null && !Array.isArray(log.metadata)
      ? (log.metadata as Record<string, unknown>).model
      : undefined;
    return total + usageNumbers(log, typeof model === "string" ? model : undefined).estimatedCostUsd;
  }, 0);
  const repairUsage = usageRows.reduce((total, log) => {
    const metadata = asRecord(log.metadata);
    const repair = asRecord(asRecord(metadata.usageBreakdown).repair);
    if (!repair) return total;
    const normalized = usageNumbers(repair, typeof metadata.model === "string" ? metadata.model : undefined);
    return { tokens: total.tokens + (normalized.totalTokens ?? 0), cost: total.cost + normalized.estimatedCostUsd, rows: total.rows + 1 };
  }, { tokens: 0, cost: 0, rows: 0 });

  return {
    promptTokens: logs._sum.promptTokens ?? 0,
    completionTokens: logs._sum.completionTokens ?? 0,
    totalTokens: logs._sum.totalTokens ?? 0,
    estimatedCostUsd: (logs._sum.costUsd ?? 0) + backfilledCostUsd,
    requestCount: logs._count._all + repairCount,
    failedRequestCount,
    repairCount,
    repairTokens: repairUsage.tokens,
    repairCostUsd: repairUsage.cost,
    usageBreakdownAvailable: repairUsage.rows > 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

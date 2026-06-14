import { Badge } from "@/components/ui/badge";
import { RoutingManager } from "@/components/admin/routing-manager";
import { listTaskExecutionPolicies } from "@/server/ai/execution-policies";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminRoutingPage() {
  const prisma = getPrisma();
  const [rules, providers, models, policies] = await Promise.all([
    prisma.providerRoutingRule.findMany({
      orderBy: [{ task: "asc" }, { priority: "asc" }],
      include: {
        provider: { select: { id: true, name: true, providerType: true } },
        model: { select: { id: true, name: true, displayName: true } },
      },
    }),
    prisma.aIProvider.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.aIModel.findMany({
      where: { enabled: true, provider: { enabled: true } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, displayName: true, providerId: true },
    }),
    listTaskExecutionPolicies(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Routing</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Adaptive Parallel Router</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Configure how many parallel lanes each AI task may open, how providers are spread across those lanes, and which model tiers are eligible for dispatch.
        </p>
      </div>
      <RoutingManager policies={policies} rules={rules} providers={providers} models={models} />
    </div>
  );
}

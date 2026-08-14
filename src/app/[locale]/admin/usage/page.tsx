import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  const logs = await getPrisma().aIUsageLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      provider: { select: { name: true, providerType: true } },
      project: { select: { name: true } },
      organization: { select: { name: true } },
      user: { select: { email: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Usage</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">AI Usage Logs</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest {logs.length} calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs">
                    {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>{log.provider?.name ?? "-"}</TableCell>
                  <TableCell>{log.operation}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === "failed" ? "destructive" : "secondary"}>{log.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{log.totalTokens ?? "-"}</TableCell>
                  <TableCell className="font-mono">{log.costUsd == null ? "-" : `$${log.costUsd.toFixed(6)}`}</TableCell>
                  <TableCell className="font-mono">{log.latencyMs ? `${log.latencyMs}ms` : "-"}</TableCell>
                  <TableCell className="whitespace-normal">{log.project?.name ?? log.organization?.name ?? "-"}</TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{log.error ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

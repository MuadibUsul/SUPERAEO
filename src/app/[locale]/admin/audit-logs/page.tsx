import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage() {
  const logs = await getPrisma().auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Audit</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Audit Logs</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest {logs.length} events</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Organization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs">
                    {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>{log.actor?.email ?? "-"}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.targetType}{log.targetId ? `:${log.targetId}` : ""}</TableCell>
                  <TableCell>{log.organization?.name ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminQueuesPage() {
  const jobs = await getPrisma().analysisJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      project: { select: { name: true } },
      run: { select: { id: true, status: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Queues</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Queue Monitor</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Latest {jobs.length} jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{job.queueName}</TableCell>
                  <TableCell>{job.jobType}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell>{currentStage(job.result)}</TableCell>
                  <TableCell>{job.project?.name ?? "-"}</TableCell>
                  <TableCell className="font-mono">{job.attempts}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {job.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function currentStage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "-";
  const stage = (value as Record<string, unknown>).currentStage;
  return typeof stage === "string" ? stage : "-";
}

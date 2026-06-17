import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/server/db";
import { checkCognitiveServiceHealth } from "@/server/external/cognitive-service";
import { checkNeo4jHealth } from "@/server/external/neo4j";
import { isObjectStorageConfigured } from "@/server/external/object-storage";
import { checkQdrantHealth } from "@/server/external/qdrant";
import { checkQueueHealth, getQueueDepths } from "@/server/queue/client";
import { getWorkerHealth } from "@/server/queue/worker-health";

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const [queue, queueDepths, worker, qdrant, neo4j, cognitive] = await Promise.all([
    withTimeout(checkQueueHealth(), "Redis / Queue"),
    getQueueDepths(),
    getWorkerHealth(),
    withTimeout(checkQdrantHealth(), "Qdrant"),
    withTimeout(checkNeo4jHealth(), "Neo4j"),
    withTimeout(checkCognitiveServiceHealth(), "Cognitive service"),
  ]);

  const checks = [
    ["Database", isDatabaseConfigured(), isDatabaseConfigured() ? "Configured." : "DATABASE_URL missing."],
    ["Redis / Queue", queue.ok, queue.message],
    ["Qdrant", qdrant.ok, qdrant.message],
    ["Neo4j", neo4j.ok, neo4j.message],
    ["Cognitive Service", cognitive.ok, cognitive.message],
    [
      "Object Storage",
      isObjectStorageConfigured(),
      isObjectStorageConfigured() ? "Configured." : "S3-compatible storage not configured.",
    ],
    [
      "Encryption Key",
      Boolean(process.env.ENCRYPTION_KEY),
      process.env.ENCRYPTION_KEY ? "Configured." : "ENCRYPTION_KEY missing.",
    ],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Health</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">System Health</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {checks.map(([label, ok, message]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="font-mono text-xl font-semibold">{ok ? "OK" : "Needs Setup"}</div>
              <div className="text-sm text-muted-foreground">{message}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className={!worker.alive && queue.ok ? "border-destructive/40 bg-destructive/5" : undefined}>
        <CardHeader>
          <CardTitle>Background processing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">Redis</div>
              <div className="mt-1 font-mono text-lg font-semibold">{queue.ok ? "Reachable" : "Down"}</div>
              <div className="mt-1 text-sm text-muted-foreground">{queue.message}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Worker</div>
              <div className={worker.alive ? "mt-1 font-mono text-lg font-semibold" : "mt-1 font-mono text-lg font-semibold text-destructive"}>
                {worker.alive ? "Up" : "Down"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{worker.message}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Last heartbeat</div>
              <div className="mt-1 font-mono text-sm">{formatTimestamp(worker.lastSeenAt)}</div>
              <div className="mt-1 text-sm text-muted-foreground">{worker.workerId ?? "No worker id"}</div>
            </div>
          </div>

          {queue.ok && queueDepths.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueDepths.map((depth) => (
                  <TableRow key={depth.queueName}>
                    <TableCell className="font-mono text-xs">{depth.queueName}</TableCell>
                    <TableCell className="font-mono">
                      {depth.waiting + depth.delayed + depth.prioritized + depth.waitingChildren}
                    </TableCell>
                    <TableCell className="font-mono">{depth.active}</TableCell>
                    <TableCell className="font-mono">{depth.failed}</TableCell>
                    <TableCell className="font-mono">{depth.completed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Queue depths are unavailable right now.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function withTimeout<T extends { ok: boolean; message: string }>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(
        () =>
          resolve({
            ok: false,
            message: `${label} health check timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000} seconds.`,
          } as T),
        HEALTH_CHECK_TIMEOUT_MS,
      );
    }),
  ]).catch((error) => ({
    ok: false,
    message: error instanceof Error ? error.message : `${label} health check failed.`,
  })) as Promise<T>;
}

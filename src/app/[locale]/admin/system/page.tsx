import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isDatabaseConfigured } from "@/server/db";
import { checkCognitiveServiceHealth } from "@/server/external/cognitive-service";
import { checkNeo4jHealth } from "@/server/external/neo4j";
import { isObjectStorageConfigured } from "@/server/external/object-storage";
import { checkQdrantHealth } from "@/server/external/qdrant";
import { checkQueueHealth } from "@/server/queue/client";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const [queue, qdrant, neo4j, cognitive] = await Promise.all([
    checkQueueHealth(),
    checkQdrantHealth(),
    checkNeo4jHealth(),
    checkCognitiveServiceHealth(),
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
    </div>
  );
}


import { AIModelForm } from "@/components/admin/ai-model-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminModelsPage() {
  const prisma = getPrisma();
  const [providers, models] = await Promise.all([
    prisma.aIProvider.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    prisma.aIModel.findMany({
      orderBy: { createdAt: "desc" },
      include: { provider: { select: { name: true, providerType: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">AI API</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Models</h1>
      </div>
      <AIModelForm providers={providers} />
      <Card>
        <CardHeader>
          <CardTitle>{models.length} models</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Tasks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">{model.displayName ?? model.name}</TableCell>
                  <TableCell>{model.provider.name}</TableCell>
                  <TableCell>{model.enabled ? "Yes" : "No"}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {[
                      model.supportsJsonSchema ? "json" : null,
                      model.supportsCitations ? "citations" : null,
                      model.supportsWebSearch ? "search" : null,
                      model.supportsEmbeddings ? "embeddings" : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </TableCell>
                  <TableCell className="whitespace-normal">{model.defaultForTasks.join(", ") || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


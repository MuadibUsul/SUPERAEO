import { PromptTemplateForm } from "@/components/admin/prompt-template-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const prompts = await getPrisma().promptTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { email: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Prompts</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Prompt Templates</h1>
      </div>
      <PromptTemplateForm />
      <Card>
        <CardHeader>
          <CardTitle>{prompts.length} templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Locale</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prompts.map((prompt) => (
                <TableRow key={prompt.id}>
                  <TableCell className="font-medium">{prompt.name}</TableCell>
                  <TableCell>{prompt.task}</TableCell>
                  <TableCell className="font-mono text-xs">{prompt.version}</TableCell>
                  <TableCell>{prompt.locale}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{prompt.status}</Badge>
                  </TableCell>
                  <TableCell>{prompt.createdBy?.email ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


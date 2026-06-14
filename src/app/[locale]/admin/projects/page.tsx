import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const projects = await getPrisma().project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      organization: true,
      _count: { select: { competitors: true, keywords: true, queries: true, runs: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Global</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Projects</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{projects.length} projects</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Keywords</TableHead>
                <TableHead>Queries</TableHead>
                <TableHead>Runs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>{project.brandName}</TableCell>
                  <TableCell>{project.organization?.name ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{project.domain}</TableCell>
                  <TableCell className="font-mono">{project._count.keywords}</TableCell>
                  <TableCell className="font-mono">{project._count.queries}</TableCell>
                  <TableCell className="font-mono">{project._count.runs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


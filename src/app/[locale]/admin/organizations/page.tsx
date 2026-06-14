import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminOrganizationsPage() {
  const organizations = await getPrisma().organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true, projects: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Customers</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">Organizations</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{organizations.length} organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Locale</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Projects</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell className="font-medium">{organization.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{organization.type}</Badge>
                  </TableCell>
                  <TableCell>{organization.defaultLocale}</TableCell>
                  <TableCell className="font-mono">{organization._count.members}</TableCell>
                  <TableCell className="font-mono">{organization._count.projects}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


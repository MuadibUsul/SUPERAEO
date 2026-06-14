import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminTraceLogsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const filter = {
    traceId: single(params.traceId),
    severity: single(params.severity),
    operation: single(params.operation),
    projectId: single(params.projectId),
    status: single(params.status),
  };
  const prisma = getPrisma();
  const where = {
    ...(filter.traceId ? { traceId: filter.traceId } : {}),
    ...(filter.severity ? { severity: filter.severity } : {}),
    ...(filter.operation ? { operation: filter.operation } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };

  const [events, errorCount, recentFailures] = await Promise.all([
    prisma.traceEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.traceEvent.count({ where: { severity: { in: ["error", "fatal"] } } }),
    prisma.traceEvent.findMany({
      where: { severity: { in: ["error", "fatal"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const activeTraceId = filter.traceId ?? events[0]?.traceId;
  const traceEvents = activeTraceId
    ? await prisma.traceEvent.findMany({
        where: { traceId: activeTraceId },
        orderBy: { createdAt: "asc" },
        take: 200,
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge variant="secondary">Trace</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal">Trace Logs</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Follow API requests, queue jobs, AI calls, JSON repair, and probe batches through one trace chain.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Metric label="Loaded" value={events.length} />
          <Metric label="Open errors" value={errorCount} />
          <Metric label="Trace events" value={traceEvents.length} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-6">
            <Input name="traceId" placeholder="traceId" defaultValue={filter.traceId} className="font-mono text-xs md:col-span-2" />
            <Input name="operation" placeholder="operation" defaultValue={filter.operation} />
            <Input name="projectId" placeholder="projectId" defaultValue={filter.projectId} className="font-mono text-xs" />
            <Input name="severity" placeholder="severity" defaultValue={filter.severity} />
            <Input name="status" placeholder="status" defaultValue={filter.status} />
            <Button type="submit" className="md:col-start-6">Search</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Latest {events.length} events</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trace</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{formatTime(event.createdAt)}</TableCell>
                    <TableCell><SeverityBadge severity={event.severity} /></TableCell>
                    <TableCell className="font-mono text-xs">{event.operation}</TableCell>
                    <TableCell>{event.status ?? "-"}</TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-xs">
                      <a href={`?traceId=${event.traceId}`} className="underline-offset-4 hover:underline">{event.traceId}</a>
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                      {event.errorMessage ?? event.message ?? event.eventType}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trace chain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="break-all font-mono text-xs text-muted-foreground">{activeTraceId ?? "No trace selected"}</p>
              {traceEvents.map((event) => (
                <div key={event.id} className="rounded-md border bg-card/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{event.eventType}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatTime(event.createdAt)} · {event.durationMs ? `${event.durationMs}ms` : "instant"}</p>
                    </div>
                    <SeverityBadge severity={event.severity} />
                  </div>
                  <p className="mt-2 text-sm">{event.errorMessage ?? event.message ?? event.status ?? "-"}</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    {[
                      event.projectId ? `project:${event.projectId}` : null,
                      event.analysisJobId ? `job:${event.analysisJobId}` : null,
                      event.promptRunId ? `prompt:${event.promptRunId}` : null,
                      event.objectType && event.objectId ? `${event.objectType}:${event.objectId}` : null,
                    ].filter(Boolean).join(" · ") || "-"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent failures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentFailures.map((event) => (
                <a key={event.id} href={`?traceId=${event.traceId}`} className="block rounded-md border p-3 text-sm hover:bg-accent">
                  <p className="font-mono text-xs">{event.operation}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{event.errorMessage ?? event.message ?? event.eventType}</p>
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card/70 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "error" || severity === "fatal" ? "destructive" : severity === "warn" ? "outline" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}


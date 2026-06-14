import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function EvidencePage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.marketingPages.evidence;
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.app.evidence}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }
  if (!state.data) notFound();

  const prisma = getPrisma();
  const [responses, latestNebula, latestOpportunity, latestTerritory] = await Promise.all([
    prisma.aIResponse.findMany({
      where: { run: { projectId } },
      include: { query: true, provider: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.semanticNebulaSnapshot.findFirst({ where: { projectId, scope: "OVERALL" }, orderBy: { createdAt: "desc" } }),
    prisma.longTailOpportunitySnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    prisma.questionTerritorySnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={dictionary.app.evidence}
      eyebrow={state.data.brandName}
      description={copy.description}
      workflowState={state.data._count}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <EvidenceSummary title={dictionary.semanticIntelligence.concepts.semanticNebula} value={latestNebula ? copy.ready : copy.pending} />
        <EvidenceSummary title={dictionary.semanticIntelligence.concepts.longTailOpportunity} value={latestOpportunity ? copy.ready : copy.pending} />
        <EvidenceSummary title={dictionary.semanticIntelligence.concepts.questionTerritory} value={latestTerritory ? copy.ready : copy.pending} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.latestTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {responses.length === 0 ? (
            <p className="text-sm text-dim">{dictionary.semanticIntelligence.states.noData}</p>
          ) : (
            responses.map((response) => (
              <article key={response.id} className="panel-inset p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="max-w-3xl text-sm font-medium text-foreground">{response.query.queryText}</h3>
                  <span className="shrink-0 font-mono text-xs text-faint">
                    {response.provider?.name ?? response.platform} / {response.model}
                  </span>
                </div>
                <p className="mt-3 max-h-24 overflow-hidden text-sm leading-6 text-dim">
                  {(response.normalizedAnswer ?? response.rawResponse).slice(0, 520)}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}

function EvidenceSummary({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-dim">{title}</div>
        <div className="mt-2 font-mono text-xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

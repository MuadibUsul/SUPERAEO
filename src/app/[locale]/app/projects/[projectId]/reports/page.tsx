import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { buildCipMetricBundle } from "@/server/metrics/cip-metrics";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function ReportsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.reportExperience;
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={copy.title}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }
  if (!state.data) notFound();

  const project = state.data;
  const subject = project.subjects[0];
  const [latestReport, metrics, latestNebula, opportunities, alerts] = await Promise.all([
    getPrisma().report.findFirst({ where: { projectId, status: "ready" }, orderBy: { createdAt: "desc" } }),
    buildCipMetricBundle(projectId, subject?.id),
    getPrisma().semanticNebulaSnapshot.findFirst({
      where: { projectId, ...(subject ? { subjectId: subject.id } : {}), scope: "OVERALL" },
      orderBy: { createdAt: "desc" },
    }),
    getPrisma().longTailOpportunitySnapshot.findFirst({
      where: { projectId, ...(subject ? { subjectId: subject.id } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    getPrisma().alert.findMany({ where: { projectId, status: "open" }, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 5 }),
  ]);

  const snapshot = asRecord(latestReport?.snapshot);
  const cognitionSummary = String(snapshot.cognitionSummary ?? copy.noReport);
  const terms = Array.isArray(latestNebula?.nodeJson) ? latestNebula.nodeJson.slice(0, 8) : [];
  const opportunityItems = Array.isArray(opportunities?.opportunityJson) ? opportunities.opportunityJson.slice(0, 5) : [];

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={copy.title}
      eyebrow={project.brandName}
      description={copy.subtitle}
      workflowState={project._count}
    >
      {!latestReport ? <StatusCallout title={copy.title} message={copy.noReport} /> : null}

      <section className="panel-strong p-6">
        <p className="eyebrow text-[oklch(0.85_0.15_85)]">{copy.executiveSummary}</p>
        <h2 className="mt-4 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">{cognitionSummary}</h2>
      </section>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <ScoreCard label={copy.scoreLabels.visibility} value={metrics.metrics.aiVisibilityScore} />
        <ScoreCard label={copy.scoreLabels.mention} value={metrics.metrics.mentionRate} />
        <ScoreCard label={copy.scoreLabels.recommendation} value={metrics.metrics.recommendationShare} />
        <ScoreCard label={copy.scoreLabels.citation} value={metrics.metrics.citationRate} />
        <ScoreCard label={copy.scoreLabels.stability} value={metrics.metrics.stabilityIndex} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <ReportSection title={copy.semanticPosition}>
          {terms.length === 0 ? (
            <p className="text-sm text-dim">{dictionary.semanticIntelligence.states.noData}</p>
          ) : (
            <div className="grid gap-2">
              {terms.map((term) => {
                const record = asRecord(term);
                return (
                  <div key={String(record.id ?? record.term)} className="panel-inset flex items-center justify-between px-3 py-2 text-sm text-dim">
                    <span>{String(record.term ?? record.normalizedTerm ?? "Term")}</span>
                    <span className="font-mono text-[oklch(0.85_0.15_85)]">{String(record.semanticGravity ?? "-")}</span>
                  </div>
                );
              })}
            </div>
          )}
        </ReportSection>

        <ReportSection title={copy.opportunities}>
          {opportunityItems.length === 0 ? (
            <p className="text-sm text-dim">{dictionary.semanticIntelligence.states.noData}</p>
          ) : (
            <div className="space-y-2">
              {opportunityItems.map((item) => {
                const record = asRecord(item);
                return (
                  <article key={String(record.id ?? record.question)} className="panel-inset p-3">
                    <div className="text-sm font-medium text-foreground">{String(record.question ?? record.opportunityTitle)}</div>
                    <div className="mt-2 text-xs text-faint">
                      LOP {String(record.longTailOccupationPotential ?? "-")} / {String(record.priority ?? "-")}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </ReportSection>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <ReportSection title={copy.risks}>
          {alerts.length === 0 ? (
            <p className="text-sm text-dim">{copy.noOpenRisks}</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <article key={alert.id} className="rounded-lg border border-[oklch(0.74_0.18_12/18%)] bg-[oklch(0.74_0.18_12/6%)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{alert.title}</span>
                    <span className="shrink-0 rounded-full border border-[oklch(0.74_0.18_12/30%)] px-2 py-0.5 font-mono text-xs text-[oklch(0.78_0.18_12)]">{alert.severity}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-faint">{alert.message}</p>
                </article>
              ))}
            </div>
          )}
        </ReportSection>

        <ReportSection title={copy.nextActions}>
          <div className="grid gap-2 text-sm text-dim">
            {copy.nextActionItems.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </ReportSection>
      </div>

      <ReportSection title={copy.evidenceAppendix}>
        <p className="text-sm leading-6 text-dim">{copy.evidenceHint}</p>
      </ReportSection>
    </ProjectPageShell>
  );
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-dim">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">{Math.round(Math.max(0, Math.min(1, value)) * 100)}</div>
      </CardContent>
    </Card>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

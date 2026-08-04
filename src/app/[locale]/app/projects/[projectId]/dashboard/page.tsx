import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles, Target } from "lucide-react";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { getCognitionBriefCopy } from "@/i18n/cognition-brief";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { buildCognitionBriefView } from "@/server/dashboard/cognition-brief";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function DashboardPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = getCognitionBriefCopy(locale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.overview.title}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) notFound();

  const project = state.data;
  const subject = project.subjects[0];
  const brief = await buildCognitionBriefView({
    projectId,
    subjectId: subject?.id,
    subjectName: subject?.displayName ?? project.brandName,
    locale,
  });

  return (
    <ProjectPageShell
      projectId={project.id}
      locale={locale}
      title={dictionary.overview.title}
      eyebrow={subject?.displayName ?? project.brandName}
      description={dictionary.overview.question}
      workflowState={project._count}
      statusVariant="compact"
    >
      {!brief.hasEvidence ? (
        <StatusCallout title={copy.notEnoughEvidence} message={copy.pendingSummary} />
      ) : null}

      <section className="panel-strong relative overflow-hidden p-7">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/20 bg-primary/10 text-primary"
            >
              <Sparkles className="h-3 w-3" />
              {brief.summary.eyebrow}
            </Badge>
            <h2 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              {brief.summary.headline}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-dim">{brief.summary.subline}</p>
          </div>
          <div className="shrink-0 rounded-2xl border border-border bg-background/30 px-5 py-4 text-right backdrop-blur">
            <div className="eyebrow text-primary">{brief.summary.evidenceLevel}</div>
            <div className="mt-2 text-sm text-faint">{copy.eyebrow}</div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href={`/${locale}/app/projects/${projectId}/semantic-nebula`}>
              {copy.exploreNebula}
              <Sparkles className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={`/${locale}/app/projects/${projectId}/opportunities`}>
              {copy.reviewOpportunities}
              <Target className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href={`/${locale}/app/projects/${projectId}/reports`}>
              {copy.openReport}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {brief.scores.map((score) => (
          <ScoreTile key={score.key} label={score.label} value={score.value} emptyLabel={copy.notEnoughEvidence} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title={copy.semanticHighlights}>
          <div className="grid gap-3 md:grid-cols-2">
            {brief.highlights.map((group) => (
              <HighlightGroup key={group.key} title={group.label} items={group.items} emptyMessage={copy.noHighlights} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title={copy.topOpportunities}>
          <div className="space-y-3">
            {brief.opportunities.length === 0 ? (
              <p className="text-sm text-faint">{copy.noOpportunities}</p>
            ) : (
              brief.opportunities.map((opportunity) => (
                <article
                  key={opportunity.id}
                  className="panel-inset p-4 transition-colors hover:border-success/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{opportunity.title}</h3>
                      <p className="mt-2 text-xs leading-5 text-faint">{opportunity.subtitle}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-semibold text-success">{opportunity.score ?? "-"}</div>
                      <div className="eyebrow text-faint">{opportunity.priority ?? ""}</div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title={copy.keyRisks}>
          <div className="space-y-3">
            {brief.risks.length === 0 ? (
              <p className="text-sm text-faint">{copy.noRisks}</p>
            ) : (
              brief.risks.map((risk) => (
                <article key={risk.id} className="rounded-lg border border-danger/20 bg-danger/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm leading-6 text-foreground/90">{risk.message}</p>
                    {risk.severity ? (
                      <span className="shrink-0 rounded-full border border-danger/30 px-2 py-0.5 font-mono text-xs text-danger">
                        {risk.severity}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title={copy.recommendedNextActions}>
          <div className="space-y-3">
            {brief.nextActions.length === 0 ? (
              <p className="text-sm text-faint">{copy.noAction}</p>
            ) : (
              brief.nextActions.map((action, index) => (
                <article key={action} className="panel-inset flex items-start gap-3 p-4 text-sm leading-6 text-dim">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] text-primary">
                    {index + 1}
                  </span>
                  {action}
                </article>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </ProjectPageShell>
  );
}

function ScoreTile({
  label,
  value,
  emptyLabel,
}: {
  label: string;
  value: number | null;
  emptyLabel: string;
}) {
  const percent = value === null ? null : Math.max(0, Math.min(100, Math.round(value * 100)));
  const tone =
    percent === null
      ? "var(--muted-foreground)"
      : percent >= 66
        ? "var(--success)"
        : percent >= 40
          ? "var(--warning)"
          : "var(--danger)";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-dim">{label}</div>
        <div className="mt-3 font-mono text-2xl font-semibold tabular-nums" style={{ color: tone }}>
          {percent === null ? "-" : percent}
        </div>
        <div className="mt-1 text-xs text-faint">{percent === null ? emptyLabel : `${percent}%`}</div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${percent ?? 0}%`, background: tone }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function HighlightGroup({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: string[];
  emptyMessage: string;
}) {
  return (
    <article className="panel-inset p-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-faint">{emptyMessage}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-dim"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

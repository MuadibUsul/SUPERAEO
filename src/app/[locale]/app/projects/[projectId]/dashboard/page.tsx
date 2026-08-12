import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles, Target, TriangleAlert } from "lucide-react";

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
import {
  buildCognitionFocus,
  type FocusMetric,
  type MetricTone,
  type ModelDatum,
  type SpectrumHue,
} from "@/server/dashboard/cognition-focus";
import { getEntityProfile } from "@/server/entity/entity-profiles";
import { getLatestCipMetricBundle } from "@/server/metrics/cip-metrics";
import { buildPositionSummary } from "@/server/semantic-nebula/position-summary";
import { getPrisma } from "@/server/db";
import { asRecord } from "@/server/utils/coerce";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

const HUE_VAR: Record<SpectrumHue, string> = {
  magenta: "var(--sp-magenta)",
  violet: "var(--sp-violet)",
  blue: "var(--sp-blue)",
  cyan: "var(--sp-cyan)",
  mint: "var(--sp-mint)",
};

const TONE_VAR: Record<MetricTone, string> = {
  good: "var(--success)",
  warn: "var(--warning)",
  bad: "var(--danger)",
  neutral: "var(--muted-foreground)",
};

export default async function DashboardPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const zh = locale === "zh-CN";
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
  const subjectName = subject?.displayName ?? project.brandName;
  const [brief, bundle, nebula] = await Promise.all([
    buildCognitionBriefView({ projectId, subjectId: subject?.id, subjectName, locale }),
    getLatestCipMetricBundle(projectId, subject?.id),
    getPrisma().semanticNebulaSnapshot.findFirst({
      where: { projectId, ...(subject?.id ? { subjectId: subject.id } : {}), scope: "OVERALL" },
      orderBy: { createdAt: "desc" },
      select: { summaryJson: true },
    }),
  ]);
  const focus = buildCognitionFocus({ entityType: subject?.entityType, bundle, locale });
  const profile = getEntityProfile(subject?.entityType);
  const verdictLead = profile.verdictLead[locale].replace("{subject}", subjectName);
  const position = buildPositionSummary({ subjectName, nebulaSummary: asRecord(nebula?.summaryJson), locale });

  const t = {
    positionEyebrow: zh ? "实体在模型内的位置" : "Position inside the model",
    anchoredAt: zh ? "被定位于" : "Anchored at",
    nearestRival: zh ? "邻域对手" : "Nearest rival",
    dangerNear: zh ? "危险贴近" : "Dangerously near",
    matters: zh ? "此类型最重要的指标" : "What matters most for this type",
    biggestGap: zh ? "最大差距" : "Biggest gap",
    topRisk: zh ? "首要风险" : "Top risk",
    byModel: zh ? "分模型可见度" : "Visibility by model",
    otherSignals: zh ? "其他信号" : "Other signals",
    samples: zh ? "样本" : "samples",
    closeThis: zh ? "优先补上这一项" : "Close this first",
  };

  return (
    <ProjectPageShell
      projectId={project.id}
      locale={locale}
      title={dictionary.overview.title}
      eyebrow={subjectName}
      description={dictionary.overview.question}
      workflowState={project._count}
      statusVariant="compact"
    >
      {!brief.hasEvidence ? (
        <StatusCallout title={copy.notEnoughEvidence} message={copy.pendingSummary} />
      ) : null}

      {/* Verdict — the one-sentence read on where the subject stands. */}
      <section className="panel-strong relative overflow-hidden p-6 md:p-7">
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: "var(--spectrum)" }} aria-hidden />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <Badge variant="outline" className="gap-1.5 border-primary/25 bg-primary/10 text-primary">
              <Sparkles className="h-3 w-3" />
              {t.positionEyebrow}
            </Badge>
            <h2 className="mt-4 text-2xl font-semibold leading-[1.2] tracking-tight text-balance text-foreground md:text-[1.9rem]">
              {position.headline}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-dim">{brief.summary.subline}</p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-faint">{verdictLead}</p>
            {position.clarity !== "unlocated" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {position.anchor ? <PositionChip label={t.anchoredAt} value={position.anchor} color="var(--mint)" /> : null}
                {position.nearestRival ? <PositionChip label={t.nearestRival} value={position.nearestRival} color="var(--violet)" /> : null}
                {position.confusion ? <PositionChip label={t.dangerNear} value={position.confusion} color="var(--magenta)" /> : null}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 rounded-xl border border-border bg-muted px-5 py-4 text-right">
            <div className="eyebrow text-primary">{copy.eyebrow}</div>
            <div className="mt-1 text-xl font-semibold tracking-tight text-foreground">{brief.summary.evidenceLevel}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
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

      {/* Focus band — the single lead metric, the biggest gap, the top risk. */}
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        {focus.primary ? <PrimaryMetric metric={focus.primary} mattersLabel={t.matters} /> : null}
        <div className="grid gap-4">
          {focus.biggestGap ? (
            <GapCard metric={focus.biggestGap} title={t.biggestGap} hint={t.closeThis} />
          ) : null}
          <article className="panel-inset flex items-start gap-3 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <div className="eyebrow text-faint">{t.topRisk}</div>
              <p className="mt-1 text-sm leading-6 text-dim">{focus.topRisk}</p>
            </div>
          </article>
        </div>
      </div>

      {/* Per-model visibility — one spectrum hue per AI model. */}
      {focus.models.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.byModel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {focus.models.map((model) => (
              <ModelRow key={model.label} model={model} samplesLabel={t.samples} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Supporting signals — demoted, still available. */}
      {focus.supporting.length > 0 ? (
        <div>
          <div className="eyebrow mb-2 text-faint">{t.otherSignals}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {focus.supporting.map((metric) => (
              <SupportingTile key={metric.key} metric={metric} />
            ))}
            {brief.scores
              .filter((score) => score.key === "semanticClarity" || score.key === "risk")
              .map((score) => (
                <SupportingTile
                  key={score.key}
                  metric={{
                    key: score.key as FocusMetric["key"],
                    label: score.label,
                    value: score.value,
                    percent: score.value === null ? null : Math.round(score.value * 100),
                    tone: score.value === null ? "neutral" : score.value >= 0.66 ? "good" : score.value >= 0.4 ? "warn" : "bad",
                    isDelta: false,
                  }}
                />
              ))}
          </div>
        </div>
      ) : null}

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
                <article key={opportunity.id} className="panel-inset p-4 transition-colors hover:border-success/30">
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
                <article key={risk.id} className="rounded-lg border-l-2 border-danger bg-danger/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm leading-6 text-foreground/90">{risk.message}</p>
                    {risk.severity ? (
                      <span className="shrink-0 rounded-md border border-danger/30 px-2 py-0.5 font-mono text-xs text-danger">
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
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/12 font-mono text-[11px] text-primary">
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

function formatMetric(metric: FocusMetric): string {
  if (metric.percent === null) return "-";
  return metric.isDelta ? `${metric.percent > 0 ? "+" : ""}${metric.percent}` : String(metric.percent);
}

function PrimaryMetric({ metric, mattersLabel }: { metric: FocusMetric; mattersLabel: string }) {
  const color = TONE_VAR[metric.tone];
  const width = metric.percent === null ? 0 : Math.max(0, Math.min(100, Math.abs(metric.percent)));
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="eyebrow text-primary">{mattersLabel}</div>
        <div className="mt-3 text-sm text-dim">{metric.label}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-5xl font-semibold tabular-nums tracking-tight" style={{ color }}>
            {formatMetric(metric)}
          </span>
          {metric.percent !== null && !metric.isDelta ? <span className="text-lg text-faint">%</span> : null}
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${width}%`, background: color }} />
        </div>
      </CardContent>
    </Card>
  );
}

function GapCard({ metric, title, hint }: { metric: FocusMetric; title: string; hint: string }) {
  const color = TONE_VAR[metric.tone];
  return (
    <article className="panel-inset p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-faint">{title}</div>
          <div className="mt-1 text-sm font-medium text-foreground">{metric.label}</div>
          <p className="mt-1 text-xs text-faint">{hint}</p>
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
          {formatMetric(metric)}
          {!metric.isDelta && metric.percent !== null ? <span className="text-sm text-faint">%</span> : null}
        </div>
      </div>
    </article>
  );
}

function ModelRow({ model, samplesLabel }: { model: ModelDatum; samplesLabel: string }) {
  const color = HUE_VAR[model.hue];
  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-sm">
      <span className="flex items-center gap-2 truncate font-medium text-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        {model.label}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-muted" title={`${model.samples} ${samplesLabel}`}>
        <span
          className="block h-full rounded-full transition-[width] duration-700"
          style={{ width: `${model.visibility}%`, background: color, boxShadow: `0 0 10px ${color}` }}
        />
      </span>
      <span className="text-right font-mono tabular-nums text-dim">{model.visibility}</span>
    </div>
  );
}

function SupportingTile({ metric }: { metric: FocusMetric }) {
  const color = TONE_VAR[metric.tone];
  return (
    <div className="panel-inset p-4">
      <div className="text-xs text-dim">{metric.label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
        {formatMetric(metric)}
        {!metric.isDelta && metric.percent !== null ? <span className="text-sm text-faint">%</span> : null}
      </div>
    </div>
  );
}

function PositionChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      <span className="text-faint">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
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

function HighlightGroup({ title, items, emptyMessage }: { title: string; items: string[]; emptyMessage: string }) {
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

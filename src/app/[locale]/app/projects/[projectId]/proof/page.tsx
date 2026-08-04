import { notFound } from "next/navigation";
import { FlaskConical, TrendingUp } from "lucide-react";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { ExperimentWaveActions, ProofExperimentBuilder } from "@/components/proof/experiment-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getProofCopy } from "@/i18n/proof-copy";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import {
  computeVisibilityOutcomeCorrelation,
  DEFAULT_OUTCOME_METRIC,
  defaultExperimentMetricForEntity,
  listExperimentSummaries,
  type ExperimentSummary,
  type OutcomeCorrelation,
} from "@/server/analysis/proof-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function ProofPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = getProofCopy(locale);
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
  const prisma = getPrisma();
  const [experiments, correlation, queries] = await Promise.all([
    listExperimentSummaries(projectId),
    computeVisibilityOutcomeCorrelation(projectId, DEFAULT_OUTCOME_METRIC),
    prisma.aeoQuery.findMany({
      where: { projectId, ...(subject ? { subjectId: subject.id } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, queryText: true, queryType: true },
      take: 80,
    }),
  ]);

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={copy.title}
      eyebrow={subject?.displayName ?? project.brandName}
      description={copy.description}
      workflowState={project._count}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            {copy.causalTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-3xl text-sm leading-6 text-dim">{copy.causalHint}</p>
          <ProofExperimentBuilder
            projectId={projectId}
            locale={locale}
            queries={queries.map((query) => ({ ...query, queryType: String(query.queryType) }))}
            defaultMetric={defaultExperimentMetricForEntity(subject?.entityType)}
          />
          {experiments.length === 0 ? (
            <p className="text-sm text-faint">{copy.noExperiments}</p>
          ) : (
            experiments.map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} projectId={projectId} locale={locale} copy={copy} />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-[oklch(0.82_0.15_162)]" />
            {copy.corrTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-3xl text-sm leading-6 text-dim">{copy.corrHint}</p>
          {correlation ? <CorrelationPanel correlation={correlation} copy={copy} /> : <p className="text-sm text-faint">{copy.noCorrelation}</p>}
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}

function ExperimentCard({
  experiment,
  projectId,
  locale,
  copy,
}: {
  experiment: ExperimentSummary;
  projectId: string;
  locale: string;
  copy: ReturnType<typeof getProofCopy>;
}) {
  const r = experiment.result;
  return (
    <article className="panel-strong p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold text-foreground">{experiment.name}</h3>
          {experiment.hypothesis ? <p className="mt-1 text-sm leading-6 text-dim">{experiment.hypothesis}</p> : null}
        </div>
        {r ? (
          <Badge
            variant="outline"
            className={
              r.significant
                ? "shrink-0 gap-1.5 border-[oklch(0.82_0.15_162/30%)] bg-[oklch(0.82_0.15_162/10%)] text-[oklch(0.82_0.15_162)]"
                : "shrink-0 gap-1.5 border-border bg-secondary text-faint"
            }
          >
            {r.significant ? copy.significant : copy.notSignificant}
          </Badge>
        ) : null}
      </div>
      <ExperimentWaveActions
        projectId={projectId}
        experimentId={experiment.id}
        locale={locale}
        hasBaseline={experiment.hasBaseline}
        hasRetest={experiment.hasRetest}
      />

      {r ? (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <ArmTrack label={copy.treatment} pre={r.treatmentPreRate} post={r.treatmentPostRate} delta={r.treatmentDelta} samples={experiment.treatmentSamples} tone="0.82 0.13 205" copy={copy} highlight />
            <ArmTrack label={copy.control} pre={r.controlPreRate} post={r.controlPostRate} delta={r.controlDelta} samples={experiment.controlSamples} tone="0.74 0.03 255" copy={copy} />
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[oklch(0.82_0.15_162/25%)] bg-[oklch(0.82_0.15_162/8%)] px-6 py-4 text-center">
              <span className="eyebrow text-faint">{copy.netLift}</span>
              <span className="mt-1 font-mono text-3xl font-semibold text-[oklch(0.82_0.15_162)]">
                {r.netLift >= 0 ? "+" : ""}
                {Math.round(r.netLift * 100)}
                <span className="text-lg">pts</span>
              </span>
              <span className="mt-1 text-xs text-faint">
                {copy.pValue} {r.pValue < 0.001 ? "<0.001" : r.pValue.toFixed(3)}
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-faint">
            {copy.drift}: {r.controlDelta >= 0 ? "+" : ""}
            {Math.round(r.controlDelta * 100)}pts · {copy.treatment} {r.treatmentDelta >= 0 ? "+" : ""}
            {Math.round(r.treatmentDelta * 100)}pts → {copy.netLift} {r.netLift >= 0 ? "+" : ""}
            {Math.round(r.netLift * 100)}pts.
          </p>
        </>
      ) : null}
    </article>
  );
}

function ArmTrack({
  label,
  pre,
  post,
  delta,
  samples,
  tone,
  copy,
  highlight,
}: {
  label: string;
  pre: number;
  post: number;
  delta: number;
  samples: number;
  tone: string;
  copy: ReturnType<typeof getProofCopy>;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "panel-inset p-4" : "rounded-lg border border-border bg-card/40 p-4"}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="size-2 rounded-full" style={{ background: `oklch(${tone})` }} />
          {label}
        </span>
        <span className="font-mono text-xs text-faint">
          {samples} {copy.samples}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2 text-sm">
        <Stat label={copy.baseline} value={pre} />
        <span className="pb-1 text-faint">→</span>
        <Stat label={copy.retest} value={post} tone={tone} />
        <span className="ml-auto pb-1 font-mono text-xs" style={{ color: `oklch(${tone})` }}>
          {delta >= 0 ? "+" : ""}
          {Math.round(delta * 100)}pts
        </span>
      </div>
      <Bar pre={pre} post={post} tone={tone} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className="font-mono text-lg font-semibold" style={tone ? { color: `oklch(${tone})` } : undefined}>
        {Math.round(value * 100)}%
      </div>
    </div>
  );
}

function Bar({ pre, post, tone }: { pre: number; post: number; tone: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-[oklch(0.92_0.04_255/10%)]">
        <div className="h-full rounded-full bg-[oklch(0.74_0.03_255/50%)]" style={{ width: `${Math.round(pre * 100)}%` }} />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[oklch(0.92_0.04_255/10%)]">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(post * 100)}%`, background: `oklch(${tone})` }} />
      </div>
    </div>
  );
}

function CorrelationPanel({ correlation, copy }: { correlation: OutcomeCorrelation; copy: ReturnType<typeof getProofCopy> }) {
  const leads = correlation.lag.bestLag > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
        <div className="panel-inset p-4">
          <div className="text-xs text-faint">{copy.sameDay}</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[oklch(0.82_0.15_162)]">{correlation.sameDayCorrelation.toFixed(2)}</div>
        </div>
        <div className="panel-inset p-4">
          <div className="text-xs text-faint">{copy.bestLag}</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-foreground">+{correlation.lag.bestLag}d</div>
          <div className="mt-1 text-[11px] text-faint">{leads ? copy.leadsBy(correlation.lag.bestLag) : copy.sameDayLabel}</div>
        </div>
        <div className="panel-inset p-4">
          <div className="text-xs text-faint">{copy.pairedDays}</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-foreground">{correlation.pairedDays}</div>
        </div>
      </div>
      <div className="panel-inset p-4">
        <div className="mb-3 flex items-center gap-4 text-xs text-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[oklch(0.85_0.15_85)]" />
            {copy.visibility}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[oklch(0.82_0.15_162)]" />
            {copy.outcome} {correlation.sourceName ? `· ${correlation.sourceName}` : ""}
          </span>
        </div>
        <DualSparkline series={correlation.series} />
      </div>
    </div>
  );
}

function DualSparkline({ series }: { series: Array<{ date: string; visibility: number; outcome: number }> }) {
  const width = 560;
  const height = 140;
  const pad = 8;
  const n = series.length;
  if (n < 2) return null;
  const xs = (i: number) => pad + (i / (n - 1)) * (width - pad * 2);
  const norm = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  };
  const visY = norm(series.map((s) => s.visibility));
  const outY = norm(series.map((s) => s.outcome));
  const path = (yFn: (v: number) => number, key: "visibility" | "outcome") =>
    series.map((s, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${yFn(s[key]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label="visibility vs outcome">
      <path d={path(visY, "visibility")} fill="none" stroke="oklch(0.85 0.15 85)" strokeWidth={2} strokeLinejoin="round" />
      <path d={path(outY, "outcome")} fill="none" stroke="oklch(0.82 0.15 162)" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, FlaskConical, Sparkles, Target, TrendingUp } from "lucide-react";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { ReportActions } from "@/components/report/report-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusCallout } from "@/components/ui/status-callout";
import { getCognitionBriefCopy } from "@/i18n/cognition-brief";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getProofCopy } from "@/i18n/proof-copy";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { buildCognitionBriefView, type CognitionBriefViewModel } from "@/server/dashboard/cognition-brief";
import {
  listExperimentSummaries,
  computeVisibilityOutcomeCorrelation,
  DEFAULT_OUTCOME_METRIC,
  type ExperimentSummary,
  type OutcomeCorrelation,
} from "@/server/analysis/proof-service";
import { getCognitionTrend, type CognitionTrend, type DriftSignal } from "@/server/analysis/trend-service";
import { getEntityProfile, getEntityMetricLabel, type EntityMetricKey } from "@/server/entity/entity-profiles";
import { getLatestCipMetricBundle, type CipMetricBundle, type ModelBreakdown } from "@/server/metrics/cip-metrics";
import { getSnapshotBrief } from "@/server/report/report-snapshot";
import { buildReportAnalysis, type ReportAnalysis } from "@/server/report/report-analysis";
import { buildPositionSummary } from "@/server/semantic-nebula/position-summary";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string; projectId: string }> };

type ReportEvidenceResponse = {
  id: string;
  query: { queryText: string };
  provider: { name: string } | null;
  platform: string;
  model: string;
  normalizedAnswer: string | null;
  rawResponse: string;
};

function copyFor(locale: string) {
  const zh = locale === "zh-CN";
  return {
    modelComparison: zh ? "模型对比" : "Model comparison",
    singleModelScope: zh
      ? "当前证据范围：单模型采样。启用多模型矩阵后会显示各模型差异。"
      : "Evidence scope: single-model sampling. Enable a model matrix to compare models here.",
    title: zh ? "认知报告" : "Cognition Report",
    subtitle: zh ? "AI 当前如何理解你 —— 每个结论都可追溯到证据。" : "How AI understands you right now — every claim traces to evidence.",
    generatedOn: zh ? "生成于" : "Generated",
    export: zh ? "导出 PDF" : "Export PDF",
    share: zh ? "复制分享链接" : "Copy share link",
    copied: zh ? "已复制" : "Copied",
    verdict: zh ? "认知结论" : "The verdict",
    biggestRisk: zh ? "最大风险" : "Biggest risk",
    topMove: zh ? "最高优先机会" : "Top move",
    scores: zh ? "认知评分" : "Cognition scores",
    primarySignals: zh ? "这类对象最该看的指标" : "What matters most for this type",
    trend: zh ? "认知随时间变化" : "Cognition over time",
    trendHint: zh ? "把快照变成监测：可见度趋势与认知漂移。" : "Snapshots become monitoring: visibility trend and cognition drift.",
    overDays: (n: number) => (zh ? `过去 ${n} 天` : `last ${n} days`),
    driftTitle: zh ? "漂移信号" : "Drift signals",
    noDrift: zh ? "暂无明显漂移。" : "No notable drift.",
    noTrend: zh ? "需要至少两次采样才能显示趋势。多跑几次诊断即可。" : "Need at least two runs to show a trend — run more diagnoses.",
    field: zh ? "AI 把你和什么关联" : "What AI associates with you",
    fieldStrong: zh ? "最强语义" : "Strongest associations",
    fieldCompetitor: zh ? "竞品占据" : "Competitor-owned",
    fieldMissing: zh ? "缺失/期望" : "Missing / desired",
    exploreNebula: zh ? "查看完整星云" : "Explore full nebula",
    strengths: zh ? "强项" : "Strengths",
    risks: zh ? "风险" : "Risks",
    gaps: zh ? "缺口" : "Gaps",
    opportunities: zh ? "下一步抢什么" : "Opportunities to take next",
    whyNow: zh ? "为什么是现在" : "Why now",
    whoOwns: zh ? "谁占着" : "Who owns it",
    whatBuild: zh ? "该做什么" : "What to build",
    proof: zh ? "证明：是你改好的，不是模型漂移" : "Proof: your impact, not model drift",
    correlation: zh ? "与真实业务结果相关性" : "Correlation with real outcomes",
    noProof: zh ? "运行一次受控实验后，这里会出现因果证明。" : "Run a controlled experiment to populate causal proof here.",
    appendix: zh ? "证据附录" : "Evidence appendix",
    appendixHint: zh ? "结论背后的原始 AI 回答样本。" : "Raw AI answer samples behind the findings.",
    nextActions: zh ? "建议的下一步" : "Recommended next actions",
    none: zh ? "暂无数据" : "No data yet",
  };
}

export default async function ReportsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = copyFor(locale);
  const briefCopy = getCognitionBriefCopy(locale);
  const proofCopy = getProofCopy(locale);
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
  const subjectName = subject?.displayName ?? project.brandName;
  const prisma = getPrisma();
  const latestReport = await prisma.report.findFirst({
    where: { projectId, status: "ready" },
    orderBy: { createdAt: "desc" },
  });
  const reportSnapshot = asRecord(latestReport?.snapshot);

  let metricsBundle: CipMetricBundle;
  let brief: CognitionBriefViewModel;
  let latestNebula: { nodeJson?: unknown } | null;
  let opportunitySnapshot: { opportunityJson?: unknown } | null;
  let experiments: ExperimentSummary[];
  let correlation: OutcomeCorrelation | null;
  let responses: ReportEvidenceResponse[];
  let trend: CognitionTrend;

  if (isReportSnapshot(reportSnapshot)) {
    metricsBundle = metricBundleFromSnapshot(reportSnapshot.metrics) ?? (await getLatestCipMetricBundle(projectId, subject?.id));
    brief = getSnapshotBrief(reportSnapshot, locale) as unknown as CognitionBriefViewModel;
    latestNebula = asNullableRecord(reportSnapshot.semanticNebula);
    opportunitySnapshot = asNullableRecord(reportSnapshot.opportunities);
    experiments = asArray(reportSnapshot.experiments) as ExperimentSummary[];
    correlation = asNullableRecord(reportSnapshot.correlation) as OutcomeCorrelation | null;
    responses = asArray(reportSnapshot.responses).map(toSnapshotResponse);
    const snapshotTrend = asNullableRecord(asRecord(reportSnapshot.trendByLocale)[locale]);
    trend = snapshotTrend
      ? (snapshotTrend as unknown as CognitionTrend)
      : await getCognitionTrend({ projectId, subjectId: subject?.id, locale });
  } else {
    const [
      freshMetrics,
      freshBrief,
      freshNebula,
      freshOpportunitySnapshot,
      freshExperiments,
      freshCorrelation,
      freshResponses,
      freshTrend,
    ] = await Promise.all([
      getLatestCipMetricBundle(projectId, subject?.id),
      buildCognitionBriefView({ projectId, subjectId: subject?.id, subjectName, locale }),
      prisma.semanticNebulaSnapshot.findFirst({
        where: { projectId, ...(subject ? { subjectId: subject.id } : {}), scope: "OVERALL" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.longTailOpportunitySnapshot.findFirst({
        where: { projectId, ...(subject ? { subjectId: subject.id } : {}) },
        orderBy: { createdAt: "desc" },
      }),
      listExperimentSummaries(projectId),
      computeVisibilityOutcomeCorrelation(projectId, DEFAULT_OUTCOME_METRIC),
      prisma.aIResponse.findMany({
        where: { run: { projectId } },
        include: { query: true, provider: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      getCognitionTrend({ projectId, subjectId: subject?.id, locale }),
    ]);
    metricsBundle = freshMetrics;
    brief = freshBrief;
    latestNebula = freshNebula;
    opportunitySnapshot = freshOpportunitySnapshot;
    experiments = freshExperiments;
    correlation = freshCorrelation;
    responses = freshResponses;
    trend = freshTrend;
  }

  const entityProfile = getEntityProfile(subject?.entityType);
  const primaryMetricRows = entityProfile.primaryMetrics.map((key) => ({
    key,
    label: getEntityMetricLabel(key, locale),
    value: entityMetricValue(key, metricsBundle),
  }));
  const verdictLens = entityProfile.verdictLead[locale].replace("{subject}", subjectName);
  const topTerms = topNebulaTerms(latestNebula?.nodeJson, 8);
  const opportunities = parseOpportunities(opportunitySnapshot?.opportunityJson).slice(0, 4);
  const experiment = experiments.find((item) => item.result) ?? null;
  // Prefer the AI-polished analysis stored with the report; fall back to the
  // deterministic skeleton for a live/preview render (no snapshot yet).
  const storedAnalysis = asNullableRecord(asRecord(reportSnapshot.analysisByLocale)[locale]);
  const reportAnalysis: ReportAnalysis =
    storedAnalysis && Array.isArray(storedAnalysis.metrics)
      ? (storedAnalysis as unknown as ReportAnalysis)
      : buildReportAnalysis({
          entityType: subject?.entityType,
          subjectName,
          bundle: metricsBundle,
          nebulaSummary: asRecord(asRecord(latestNebula).summaryJson),
          correlation: correlation as Record<string, unknown> | null,
          experiments: experiments.map((item) => ({
            name: item.name,
            significant: Boolean(item.result?.significant),
            netEffect: item.result?.netLift,
            pValue: item.result?.pValue,
          })),
          locale,
        });
  const analysisTone: Record<string, string> = {
    good: "var(--success)",
    warn: "var(--warning)",
    bad: "var(--danger)",
    neutral: "var(--muted-foreground)",
  };
  const position = buildPositionSummary({ subjectName, nebulaSummary: asRecord(asRecord(latestNebula).summaryJson), locale });
  const generatedAt = new Date().toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={copy.title}
      eyebrow={subjectName}
      description={copy.subtitle}
      workflowState={project._count}
    >
      {!brief.hasEvidence ? <StatusCallout title={copy.title} message={briefCopy.pendingSummary} /> : null}

      <article className="mx-auto w-full max-w-4xl space-y-5">
        {/* Cover */}
        <header className="panel-strong relative overflow-hidden p-7">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="h-3 w-3" />
                {subjectName}
              </Badge>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{copy.title}</h2>
              <p className="mt-1.5 text-sm text-faint">
                {copy.generatedOn} {generatedAt} · {brief.summary.evidenceLevel}
              </p>
            </div>
            <ReportActions exportLabel={copy.export} shareLabel={copy.share} copiedLabel={copy.copied} />
          </div>
        </header>

        {/* 1. Verdict */}
        <Section index={1} title={copy.verdict}>
          <p className="mb-3 text-xs uppercase tracking-wide text-cyan">
            {locale === "zh-CN" ? "实体在模型内的位置" : "Position inside the model"} · {verdictLens}
          </p>
          <p className="text-xl font-medium leading-8 text-foreground md:text-2xl">{position.headline}</p>
          <p className="mt-2 text-sm text-dim">{brief.summary.headline}</p>
          <p className="mt-1 text-sm text-faint">{brief.summary.subline}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Callout tone="var(--danger)" icon={<AlertTriangle className="h-4 w-4" />} label={copy.biggestRisk} body={brief.risks[0]?.message ?? entityProfile.topRisk[locale]} />
            <Callout tone="var(--success)" icon={<Target className="h-4 w-4" />} label={copy.topMove} body={brief.opportunities[0]?.title ?? copy.none} />
          </div>

          {reportAnalysis.metrics.length > 0 ? (
            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-wide text-faint">{locale === "zh-CN" ? "逐项深度分析" : "Metric-by-metric analysis"}</p>
              {reportAnalysis.metrics.map((metric) => (
                <div key={metric.key} className="panel-inset p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{metric.label}</span>
                    <span className="font-mono text-sm tabular-nums" style={{ color: analysisTone[metric.tone] }}>
                      {metric.percent === null ? "-" : metric.percent}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-dim">{metric.context}</p>
                  {metric.drivers.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {metric.drivers.map((driver) => (
                        <li key={driver} className="flex gap-2 text-xs leading-5 text-faint">
                          <span aria-hidden>·</span>
                          {driver}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {metric.causal ? <p className="mt-2 text-xs leading-5 text-cyan">{metric.causal}</p> : null}
                  {metric.impact ? <p className="mt-1 text-xs leading-5 text-faint">→ {metric.impact}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </Section>

        {/* 2. Scores */}
        <Section index={2} title={copy.scores}>
          <p className="mb-4 text-sm text-faint">
            {copy.primarySignals}:{" "}
            <span className="text-dim">
              {entityProfile.primaryMetrics.map((key) => getEntityMetricLabel(key, locale)).join(" · ")}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {brief.scores.map((score) => (
              <ScoreTile key={score.key} label={score.label} value={score.value} />
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {primaryMetricRows.map((score) => (
              <ScoreTile key={score.key} label={score.label} value={score.value} />
            ))}
          </div>
          <ModelComparison rows={metricsBundle.modelBreakdown} copy={copy} />
        </Section>

        {/* 3. Cognition over time */}
        <Section index={3} title={copy.trend}>
          <p className="mb-4 text-sm text-faint">{copy.trendHint}</p>
          {trend.hasData ? (
            <TrendBlock trend={trend} copy={copy} locale={locale} />
          ) : (
            <p className="text-sm text-faint">{copy.noTrend}</p>
          )}
        </Section>

        {/* 4. Semantic field */}
        <Section
          index={4}
          title={copy.field}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/${locale}/app/projects/${projectId}/semantic-nebula`}>
                {copy.exploreNebula}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        >
          {topTerms.length > 0 ? (
            <div className="mb-5 space-y-1.5">
              {topTerms.map((term) => (
                <div key={term.term} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-dim">{term.term}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${term.gravity}%`, background: toneForTerm(term) }} />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-xs text-faint">{term.gravity}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <TermGroup title={copy.fieldStrong} items={group(brief.highlights, "positiveTerms")} tone="var(--success)" />
            <TermGroup title={copy.fieldCompetitor} items={group(brief.highlights, "competitorTerms")} tone="var(--warning)" />
            <TermGroup title={copy.fieldMissing} items={group(brief.highlights, "missingTerms")} tone="var(--violet)" />
          </div>
        </Section>

        {/* 5. Strengths / Risks / Gaps */}
        <Section index={5} title={`${copy.strengths} · ${copy.risks} · ${copy.gaps}`}>
          <div className="grid gap-3 md:grid-cols-3">
            <Column title={copy.strengths} tone="var(--success)" items={group(brief.highlights, "positiveTerms")} />
            <Column title={copy.risks} tone="var(--danger)" items={brief.risks.map((r) => r.message)} />
            <Column title={copy.gaps} tone="var(--violet)" items={group(brief.highlights, "missingTerms")} />
          </div>
        </Section>

        {/* 6. Opportunities */}
        <Section index={6} title={copy.opportunities}>
          <div className="space-y-3">
            {opportunities.length === 0 ? (
              <p className="text-sm text-faint">{copy.none}</p>
            ) : (
              opportunities.map((opp) => (
                <article key={opp.id} className="panel-inset p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-medium text-foreground">{opp.question}</h4>
                    <span className="shrink-0 rounded-full border border-warning/30 px-2 py-0.5 font-mono text-xs text-warning">
                      {opp.priority} · {opp.lop}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <Field label={copy.whyNow} value={opp.scenario} />
                    <Field label={copy.whoOwns} value={opp.competitors.join("、") || copy.none} />
                    <Field label={copy.whatBuild} value={opp.assets.join("、") || copy.none} />
                  </div>
                </article>
              ))
            )}
          </div>
        </Section>

        {/* 7. Proof */}
        <Section index={7} title={copy.proof}>
          {experiment?.result || correlation ? (
            <div className="grid gap-3 md:grid-cols-2">
              {experiment?.result ? (
                <div className="panel-inset p-5">
                  <div className="flex items-center gap-2 text-sm text-dim">
                    <FlaskConical className="h-4 w-4 text-cyan" />
                    {experiment.name}
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <span className="font-mono text-3xl font-semibold text-success">
                      {experiment.result.netLift >= 0 ? "+" : ""}
                      {Math.round(experiment.result.netLift * 100)}
                      <span className="text-lg">pts</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        experiment.result.significant
                          ? "mb-1 border-success/30 bg-success/10 text-success"
                          : "mb-1 border-border bg-secondary text-faint"
                      }
                    >
                      {experiment.result.significant ? proofCopy.significant : proofCopy.notSignificant}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-faint">{proofCopy.netLift} · p {experiment.result.pValue < 0.001 ? "<0.001" : experiment.result.pValue.toFixed(3)}</p>
                </div>
              ) : null}
              {correlation ? (
                <div className="panel-inset p-5">
                  <div className="flex items-center gap-2 text-sm text-dim">
                    <TrendingUp className="h-4 w-4 text-success" />
                    {copy.correlation}
                  </div>
                  <div className="mt-3 font-mono text-3xl font-semibold text-success">r = {correlation.sameDayCorrelation.toFixed(2)}</div>
                  <p className="mt-1 text-xs text-faint">
                    {correlation.lag.bestLag > 0 ? proofCopy.leadsBy(correlation.lag.bestLag) : ""} · {correlation.sourceName ?? ""}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-faint">{copy.noProof}</p>
          )}
        </Section>

        {/* 8. Next actions */}
        <Section index={8} title={copy.nextActions}>
          <div className="space-y-2">
            {brief.nextActions.length === 0 ? (
              <p className="text-sm text-faint">{copy.none}</p>
            ) : (
              brief.nextActions.map((action, i) => (
                <div key={action} className="flex items-start gap-3 text-sm leading-6 text-dim">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] text-primary">{i + 1}</span>
                  {action}
                </div>
              ))
            )}
          </div>
        </Section>

        {/* 9. Evidence appendix */}
        <Section index={9} title={copy.appendix}>
          <p className="mb-3 text-sm text-faint">{copy.appendixHint}</p>
          <div className="space-y-2">
            {responses.length === 0 ? (
              <p className="text-sm text-faint">{copy.none}</p>
            ) : (
              responses.map((response) => (
                <div key={response.id} className="panel-inset p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{response.query.queryText}</p>
                    <span className="shrink-0 font-mono text-[11px] text-faint">{response.provider?.name ?? response.platform} / {response.model}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-dim">{(response.normalizedAnswer ?? response.rawResponse).slice(0, 280)}</p>
                </div>
              ))
            )}
          </div>
        </Section>
      </article>
    </ProjectPageShell>
  );
}

function Section({ index, title, action, children }: { index: number; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-3 text-base font-semibold text-foreground">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 font-mono text-xs text-primary">{index}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function TrendBlock({ trend, copy, locale }: { trend: CognitionTrend; copy: ReturnType<typeof copyFor>; locale: string }) {
  const labels: Record<string, string> =
    locale === "zh-CN"
      ? { visibility: "AI 可见度", mention: "提及率", recommendation: "推荐占比", citation: "引用率" }
      : { visibility: "AI visibility", mention: "Mention", recommendation: "Recommendation", citation: "Citation" };
  const sev: Record<DriftSignal["severity"], string> = {
    positive: "var(--success)",
    watch: "var(--warning)",
    negative: "var(--danger)",
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="panel-inset p-4">
        <div className="flex items-center justify-between text-xs text-faint">
          <span>{labels.visibility}</span>
          <span>{copy.overDays(trend.days)}</span>
        </div>
        <TrendSparkline values={trend.series.map((p) => p.visibility)} />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {trend.metrics.map((m) => {
            const up = m.delta > 0;
            const tone = m.delta === 0 ? "var(--muted-foreground)" : up ? "var(--success)" : "var(--danger)";
            return (
              <div key={m.key} className="rounded-lg border border-border bg-card/40 p-2">
                <div className="text-[10px] text-faint">{labels[m.key]}</div>
                <div className="mt-0.5 font-mono text-sm font-semibold" style={{ color: tone }}>
                  {up ? "+" : ""}{m.delta}<span className="text-[10px]">pts</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel-inset p-4">
        <div className="text-xs font-medium text-foreground">{copy.driftTitle}</div>
        <div className="mt-3 space-y-2">
          {trend.signals.length === 0 ? (
            <p className="text-xs text-faint">{copy.noDrift}</p>
          ) : (
            trend.signals.slice(0, 6).map((signal) => (
              <div
                key={signal.id}
                className="rounded-lg border p-2.5 text-xs leading-5"
                style={{
                  borderColor: `color-mix(in oklab, ${sev[signal.severity]} 22%, transparent)`,
                  background: `color-mix(in oklab, ${sev[signal.severity]} 6%, transparent)`,
                }}
              >
                {signal.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TrendSparkline({ values }: { values: number[] }) {
  const width = 480;
  const height = 90;
  const pad = 6;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="visibility trend">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="color-mix(in oklab, var(--success) 32%, transparent)" />
          <stop offset="100%" stopColor="color-mix(in oklab, var(--success) 0%, transparent)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke="var(--success)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Callout({ tone, icon, label, body }: { tone: string; icon: React.ReactNode; label: string; body: string }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${tone} 22%, transparent)`,
        background: `color-mix(in oklab, ${tone} 6%, transparent)`,
      }}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: tone }}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground/90">{body}</p>
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number | null }) {
  const pct = value === null ? null : Math.max(0, Math.min(100, Math.round(value * 100)));
  const tone =
    pct === null ? "var(--muted-foreground)" : pct >= 66 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="panel-inset p-3">
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums" style={{ color: tone }}>
        {pct === null ? "-" : pct}
      </div>
    </div>
  );
}

function ModelComparison({ rows, copy }: { rows: ModelBreakdown[]; copy: ReturnType<typeof copyFor> }) {
  if (rows.length < 2) {
    return <p className="mt-4 text-xs leading-5 text-faint">{copy.singleModelScope}</p>;
  }

  return (
    <div className="mt-5 panel-inset p-4">
      <div className="mb-3 text-sm font-medium text-foreground">{copy.modelComparison}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.slice(0, 4).map((row) => (
          <div key={row.modelKey} className="rounded-lg border border-border bg-card/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">{row.providerName ?? row.platform}</div>
                <div className="mt-0.5 text-xs text-faint">{row.model}</div>
              </div>
              <span className="font-mono text-[11px] text-faint">{row.sampleCount}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <MiniMetric label="Mention" value={row.mentionRate} />
              <MiniMetric label="Rec" value={row.recommendationShare} />
              <MiniMetric label="Cite" value={row.citationRate} />
              <MiniMetric label="Acc" value={row.accuracyScore} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div>
      <div className="text-[10px] uppercase text-faint">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-dim">{pct}</div>
    </div>
  );
}

function TermGroup({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className="panel-inset p-4">
      <div className="text-xs font-medium" style={{ color: tone }}>{title}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? <span className="text-xs text-faint">—</span> : items.map((item) => (
          <span key={item} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-dim">{item}</span>
        ))}
      </div>
    </div>
  );
}

function Column({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  return (
    <div className="panel-inset p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="size-2 rounded-full" style={{ background: tone }} />
        {title}
      </div>
      <ul className="mt-3 space-y-2">
        {items.length === 0 ? <li className="text-xs text-faint">—</li> : items.slice(0, 5).map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-start gap-2 text-xs leading-5 text-dim">
            <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: tone }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 text-xs leading-5 text-dim">{value}</div>
    </div>
  );
}

type NebTerm = { term: string; gravity: number; termType: string; context: { competitorContext?: boolean; missingDesired?: boolean; riskContext?: boolean } };

function topNebulaTerms(value: unknown, limit: number): NebTerm[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((node) => {
      const record = node as Record<string, unknown>;
      return {
        term: typeof record.term === "string" ? record.term : "",
        gravity: typeof record.semanticGravity === "number" ? Math.round(record.semanticGravity) : 0,
        termType: typeof record.termType === "string" ? record.termType : "OTHER",
        context: (record.context && typeof record.context === "object" ? record.context : {}) as NebTerm["context"],
      };
    })
    .filter((t) => t.term)
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, limit);
}

function toneForTerm(term: NebTerm): string {
  if (term.context.competitorContext) return "var(--warning)";
  if (term.context.missingDesired) return "var(--violet)";
  if (term.context.riskContext) return "var(--danger)";
  return "var(--success)";
}

type Opp = { id: string; question: string; scenario: string; priority: string; lop: number; competitors: string[]; assets: string[] };

function parseOpportunities(value: unknown): Opp[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const r = item as Record<string, unknown>;
    return {
      id: typeof r.id === "string" ? r.id : `opp-${index}`,
      question: typeof r.question === "string" ? r.question : typeof r.opportunityTitle === "string" ? r.opportunityTitle : `Opportunity ${index + 1}`,
      scenario: typeof r.scenario === "string" ? r.scenario : "",
      priority: typeof r.priority === "string" ? r.priority : "P2",
      lop: typeof r.longTailOccupationPotential === "number" ? Math.round(r.longTailOccupationPotential) : 0,
      competitors: Array.isArray(r.occupiedByCompetitors) ? r.occupiedByCompetitors.map(String) : [],
      assets: Array.isArray(r.recommendedContentAssets) ? r.recommendedContentAssets.map(String) : [],
    };
  });
}

function group(highlights: Array<{ key: string; items: string[] }>, key: string): string[] {
  return highlights.find((h) => h.key === key)?.items ?? [];
}

function entityMetricValue(key: EntityMetricKey, bundle: CipMetricBundle) {
  switch (key) {
    case "recognition":
      return bundle.metrics.mentionRate;
    case "recommendationShare":
      return bundle.metrics.recommendationShare;
    case "citationRate":
      return bundle.metrics.citationRate;
    case "accuracy":
      return bundle.entityMetrics.factualAccuracy;
    case "authority":
      return bundle.entityMetrics.authority || bundle.metrics.entityVisibility;
    case "featureAccuracy":
      return bundle.entityMetrics.featureAccuracy;
    case "competitorDelta":
      return clamp01(0.5 + bundle.metrics.competitorDelta / 2);
    case "semanticCoverage":
      return bundle.metrics.semanticCoverage;
  }
}

function metricBundleFromSnapshot(value: unknown): CipMetricBundle | null {
  const record = asRecord(value);
  return isRecord(record.metrics) && typeof record.sampleCount === "number" ? (record as unknown as CipMetricBundle) : null;
}

function toSnapshotResponse(value: unknown): ReportEvidenceResponse {
  const record = asRecord(value);
  const providerName = stringOrDefault(record.providerName, stringOrDefault(record.platform, ""));
  return {
    id: stringOrDefault(record.id, stringOrDefault(record.queryText, "response")),
    query: { queryText: stringOrDefault(record.queryText, "") },
    provider: providerName ? { name: providerName } : null,
    platform: stringOrDefault(record.platform, providerName || "unknown"),
    model: stringOrDefault(record.model, "unknown"),
    normalizedAnswer: stringOrNull(record.normalizedAnswer),
    rawResponse: stringOrDefault(record.rawResponse, stringOrDefault(record.normalizedAnswer, "")),
  };
}

function isReportSnapshot(value: Record<string, unknown>) {
  return typeof value.version === "string" && isRecord(value.briefs);
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

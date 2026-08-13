import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { SemanticCoverageCharts } from "@/components/semantic-intelligence/semantic-coverage-charts";
import { GenerateAction } from "@/components/workflow/generate-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string; projectId: string }> };

export default async function SemanticCoveragePage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.semanticIntelligence.coverage;
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return <ProjectPageShell projectId={projectId} locale={locale} title={copy.title}><StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} /></ProjectPageShell>;
  }
  if (!state.data) notFound();

  const runsReady = state.data._count.runs > 0;
  const snapshot = await getPrisma().semanticCoverageSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  const evidence = asRecord(snapshot?.evidence);
  const isV2 = evidence.schemaVersion === 2;
  const overall = asRecord(evidence.overall);
  const exploration = asRecord(evidence.exploration);
  const semantic = asRecord(evidence.semantic);
  const domainRecords = asRecord(evidence.domains);
  const domains = Object.entries(domainRecords).map(([domain, value]) => ({ domain, coverage: numberValue(asRecord(value).estimatedCoverage) * 100 }));
  const history = arrayRecords(evidence.history).map((item) => ({ iteration: numberValue(item.iteration), clusters: numberValue(item.semanticClusters), clusterNovelty: numberValue(asRecord(item.novelty).cluster) }));
  const gaps = arrayRecords(evidence.gaps);

  return (
    <ProjectPageShell projectId={projectId} locale={locale} title={copy.title} eyebrow={state.data.brandName} description={copy.description} workflowState={state.data._count}>
      {!runsReady && !snapshot ? <StatusCallout title={dictionary.semanticIntelligence.states.lockedTitle} message={dictionary.semanticIntelligence.states.lockedMessage} /> : null}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{copy.snapshot}</CardTitle>
          <GenerateAction endpoint={`/api/projects/${projectId}/semantic-coverage`} label={copy.generate} disabled={!runsReady} disabledReason={!runsReady ? dictionary.semanticIntelligence.states.lockedMessage : null} />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <MetricTile label={copy.estimatedCoverage} value={isV2 ? percent(numberValue(overall.estimatedCoverage)) : percent(snapshot?.overallCoverage)} />
          <MetricTile label={copy.saturationScore} value={isV2 ? percent(numberValue(overall.saturationScore)) : "--"} />
          <MetricTile label={copy.semanticUnits} value={isV2 ? numberValue(semantic.semanticUnits) : "--"} />
          <MetricTile label={copy.semanticClusters} value={isV2 ? numberValue(semantic.clusters) : "--"} />
          <MetricTile label={copy.relationTypes} value={isV2 ? numberValue(semantic.relationTypes) : "--"} />
          <MetricTile label={copy.probeCount} value={isV2 ? numberValue(exploration.totalProbes) : "--"} />
          <MetricTile label={copy.iteration} value={isV2 ? numberValue(exploration.iterations) : "--"} />
        </CardContent>
      </Card>

      {isV2 ? (
        <>
          <SemanticCoverageCharts domains={domains} history={history} copy={{ domains: copy.domains, discovery: copy.discovery, iteration: copy.iteration, clusters: copy.clusters, novelty: copy.novelty }} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{copy.gaps}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {gaps.length === 0 ? <p className="text-sm text-muted-foreground">{copy.gapsEmpty}</p> : gaps.map((gap) => (
                  <div key={String(gap.domain)} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                    <span className="font-medium">{String(gap.domain)}</span>
                    <span className="font-mono text-muted-foreground">{percent(numberValue(gap.coverage))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{copy.stopReason}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="font-medium">{String(exploration.stopReason ?? copy.exploring)}</div>
                <p className="text-muted-foreground">{stopExplanation(exploration, overall, locale)}</p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : snapshot ? <StatusCallout title={copy.snapshot} message={copy.legacy} /> : null}
    </ProjectPageShell>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md border border-border p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 font-mono text-2xl font-semibold">{value}</div></div>;
}

function stopExplanation(exploration: Record<string, unknown>, overall: Record<string, unknown>, locale: string) {
  const rolling = asRecord(exploration.rolling);
  const novelty = percent(numberValue(rolling.cluster));
  const coverage = percent(numberValue(overall.estimatedCoverage));
  return locale === "zh-CN" ? `最近滚动窗口的 Cluster Novelty 为 ${novelty}，估算覆盖为 ${coverage}。饱和仅表示可观测探针空间的边际新增趋近于零，不等于绝对知识穷尽。` : `Rolling cluster novelty is ${novelty}; estimated coverage is ${coverage}. Saturation means marginal discovery in the observable probe space is near zero, not absolute knowledge exhaustion.`;
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function arrayRecords(value: unknown) { return Array.isArray(value) ? value.map(asRecord) : []; }
function numberValue(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function percent(value: number | null | undefined) { return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "--"; }

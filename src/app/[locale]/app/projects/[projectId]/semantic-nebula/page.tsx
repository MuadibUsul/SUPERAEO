import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { SemanticJobAction } from "@/components/semantic-intelligence/semantic-job-action";
import { CognitionUniverse } from "@/components/semantic-intelligence/cognition-universe";
import { adaptNebulaNodes } from "@/components/semantic-intelligence/universe-adapter";
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

export default async function SemanticNebulaPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.semanticIntelligence.nebula.title}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) notFound();

  const runsReady = state.data._count.runs > 0;
  const subject = state.data.subjects[0];
  const [overall, latestJob] = await Promise.all([
    subject
      ? getPrisma().semanticNebulaSnapshot.findFirst({
          where: { projectId, subjectId: subject.id, scope: "OVERALL" },
          orderBy: { createdAt: "desc" },
          select: { id: true, nodeJson: true, summaryJson: true },
        })
      : null,
    getPrisma().analysisJob.findFirst({
      where: { projectId, jobType: "semantic_nebula_build" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const summary = asRecord(overall?.summaryJson);

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={dictionary.semanticIntelligence.nebula.title}
      eyebrow={state.data.brandName}
      description={dictionary.semanticIntelligence.nebula.description}
      workflowState={state.data._count}
    >
      {!runsReady ? (
        <StatusCallout
          title={dictionary.semanticIntelligence.states.lockedTitle}
          message={dictionary.semanticIntelligence.states.lockedMessage}
        />
      ) : null}

      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3 xl:grid-cols-6">
        <MetricTile label={dictionary.semanticIntelligence.nebula.totalTerms} value={summary.totalTerms} />
        <MetricTile label={dictionary.semanticIntelligence.nebula.positiveGravity} value={summary.positiveGravity} />
        <MetricTile label={dictionary.semanticIntelligence.nebula.negativeGravity} value={summary.negativeGravity} />
        <MetricTile label={dictionary.semanticIntelligence.concepts.missingDesiredTerms} value={summary.missingDesiredTerms} />
        <MetricTile label={dictionary.semanticIntelligence.nebula.competitorGravity} value={summary.competitorGravity} />
        <MetricTile label={dictionary.semanticIntelligence.concepts.incorrectAssociationRisk} value={summary.incorrectAssociationRisk} />
      </div>

      <Card className="dark border-border bg-[#03050b] text-foreground shadow-[0_24px_80px_-36px_rgba(30,180,220,0.24)]">
        <CardHeader className="flex flex-col gap-3 border-b border-white/8 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="eyebrow text-primary">Cognition field</div><CardTitle className="mt-1 text-white">{dictionary.semanticIntelligence.concepts.observableAnswerSpace}</CardTitle></div>
          <SemanticJobAction
            endpoint={`/api/projects/${projectId}/semantic-nebula`}
            label={dictionary.semanticIntelligence.actions.buildNebula}
            disabled={!runsReady}
            latestJob={latestJob}
            copy={{
              latestJob: dictionary.semanticIntelligence.states.latestJob,
              latestStage: dictionary.semanticIntelligence.states.latestStage,
            }}
          />
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <CognitionUniverse
            subjectName={subject?.displayName ?? state.data.brandName}
            nodes={adaptNebulaNodes(overall?.nodeJson, Number.POSITIVE_INFINITY, undefined, false)}
            evidenceEndpoint={overall ? `/api/projects/${projectId}/semantic-nebula/evidence?snapshotId=${overall.id}` : undefined}
            className="h-[620px] lg:h-[720px]"
            copy={{
              legend:
                locale === "zh-CN"
                  ? { positive: "正向评价", risk: "风险 / 负向", opportunity: "机会", competitor: "竞品", entity: "实体", attribute: "属性", context: "场景 / 人群", activity: "行动 / 事件", relation: "关系", evidence: "证据" }
                  : { positive: "Positive", risk: "Risk", opportunity: "Opportunity", competitor: "Competitor", entity: "Entity", attribute: "Attribute", context: "Context", activity: "Activity", relation: "Relation", evidence: "Evidence" },
              hint: locale === "zh-CN" ? "拖拽环绕 · 指针缩放 · 单击聚焦 · 双击深入" : "drag · cursor zoom · click to focus · double-click to dive",
              pull: locale === "zh-CN" ? "引力" : "pull",
              freq: locale === "zh-CN" ? "频率" : "freq",
              confidence: locale === "zh-CN" ? "证据置信度" : "confidence",
              fullscreen: locale === "zh-CN" ? "\u5168\u5c4f" : "Fullscreen",
              exitFullscreen: locale === "zh-CN" ? "\u9000\u51fa\u5168\u5c4f" : "Exit fullscreen",
              balanced: locale === "zh-CN" ? "\u5747\u8861\u89c2\u6d4b" : "Balanced",
              raw: locale === "zh-CN" ? "\u539f\u59cb\u7a7a\u95f4" : "Raw space",
              zoomIn: locale === "zh-CN" ? "放大" : "Zoom in",
              zoomOut: locale === "zh-CN" ? "缩小" : "Zoom out",
              resetView: locale === "zh-CN" ? "适配全图" : "Fit nebula",
              encoding: locale === "zh-CN" ? "距离：语义接近度　/　大小：与对象相关性　/　亮度：置信度" : "distance: semantic proximity  /  size: relevance to subject  /  brightness: confidence",
              empty: dictionary.semanticIntelligence.states.noData,
              evidence: locale === "zh-CN" ? "AI 为何把它放在这" : "Why AI placed it here",
            }}
          />
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}

function MetricTile({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="bg-card px-4 py-4">
      <div className="text-[11px] leading-4 text-muted-foreground">{label}</div>
      <div className="metric-number mt-2 text-2xl font-semibold">{typeof value === "number" ? value : "--"}</div>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

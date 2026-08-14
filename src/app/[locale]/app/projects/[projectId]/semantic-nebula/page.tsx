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
  const [snapshots, latestJob] = await Promise.all([
    subject
      ? getPrisma().semanticNebulaSnapshot.findMany({
          where: { projectId, subjectId: subject.id },
          orderBy: [{ scope: "asc" }, { createdAt: "desc" }],
        })
      : [],
    getPrisma().analysisJob.findFirst({
      where: { projectId, jobType: "semantic_nebula_build" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const latestByScope = dedupeLatestSnapshotsByScope(snapshots);
  const overall = latestByScope.find((snapshot) => snapshot.scope === "OVERALL") ?? latestByScope[0];
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

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile label={dictionary.semanticIntelligence.nebula.totalTerms} value={summary.totalTerms} />
        <MetricTile label={dictionary.semanticIntelligence.nebula.positiveGravity} value={summary.positiveGravity} />
        <MetricTile label={dictionary.semanticIntelligence.nebula.negativeGravity} value={summary.negativeGravity} />
        <MetricTile label={dictionary.semanticIntelligence.concepts.missingDesiredTerms} value={summary.missingDesiredTerms} />
        <MetricTile label={dictionary.semanticIntelligence.nebula.competitorGravity} value={summary.competitorGravity} />
        <MetricTile label={dictionary.semanticIntelligence.concepts.incorrectAssociationRisk} value={summary.incorrectAssociationRisk} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{dictionary.semanticIntelligence.concepts.observableAnswerSpace}</CardTitle>
          <SemanticJobAction
            endpoint={`/api/projects/${projectId}/semantic-nebula/build`}
            label={dictionary.semanticIntelligence.actions.buildNebula}
            disabled={!runsReady}
            latestJob={latestJob}
            copy={{
              latestJob: dictionary.semanticIntelligence.states.latestJob,
              latestStage: dictionary.semanticIntelligence.states.latestStage,
            }}
          />
        </CardHeader>
        <CardContent>
          <CognitionUniverse
            subjectName={subject?.displayName ?? state.data.brandName}
            nodes={adaptNebulaNodes(overall?.nodeJson)}
            className="h-[560px]"
            copy={{
              legend:
                locale === "zh-CN"
                  ? { positive: "正向评价", risk: "风险 / 负向", opportunity: "机会", competitor: "竞品", entity: "实体", attribute: "属性", context: "场景 / 人群", activity: "行动 / 事件", relation: "关系", evidence: "证据" }
                  : { positive: "Positive", risk: "Risk", opportunity: "Opportunity", competitor: "Competitor", entity: "Entity", attribute: "Attribute", context: "Context", activity: "Activity", relation: "Relation", evidence: "Evidence" },
              hint: locale === "zh-CN" ? "拖拽环绕 · 滚轮缩放 · 点击星飞抵" : "drag · scroll · click a star",
              pull: locale === "zh-CN" ? "引力" : "pull",
              freq: locale === "zh-CN" ? "频率" : "freq",
              confidence: locale === "zh-CN" ? "证据置信度" : "confidence",
              fullscreen: locale === "zh-CN" ? "\u5168\u5c4f" : "Fullscreen",
              exitFullscreen: locale === "zh-CN" ? "\u9000\u51fa\u5168\u5c4f" : "Exit fullscreen",
              balanced: locale === "zh-CN" ? "\u5747\u8861\u89c2\u6d4b" : "Balanced",
              raw: locale === "zh-CN" ? "\u539f\u59cb\u7a7a\u95f4" : "Raw space",
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
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold">{typeof value === "number" ? value : "--"}</div>
      </CardContent>
    </Card>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function dedupeLatestSnapshotsByScope<T extends { scope: string }>(snapshots: T[]) {
  const latest = new Map<string, T>();
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.scope)) {
      latest.set(snapshot.scope, snapshot);
    }
  }
  return Array.from(latest.values());
}

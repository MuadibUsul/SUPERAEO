import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { GenerateAction } from "@/components/workflow/generate-action";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function SemanticCoveragePage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Semantic Coverage">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  const runsReady = state.data._count.runs > 0;
  const snapshot = runsReady
    ? await getPrisma().semanticCoverageSnapshot.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const missingConcepts = Array.isArray(snapshot?.missingConcepts) ? snapshot.missingConcepts : [];

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={locale === "zh-CN" ? "语义覆盖" : "Semantic Coverage"}
      eyebrow={state.data.brandName}
      description={
        locale === "zh-CN"
          ? "衡量品牌在目标主题、意图和概念空间中的覆盖完整度。"
          : "Measure how completely the brand covers the target semantic space across topics and intent."
      }
      workflowState={state.data._count}
    >
      {!runsReady ? (
        <StatusCallout
          title={locale === "zh-CN" ? "分析层尚未解锁" : "Analysis layer locked"}
          message={
            locale === "zh-CN"
              ? "语义覆盖依赖采样后的回答分析。请先完成至少一次采样运行。"
              : "Semantic coverage depends on analyzed sampled answers. Complete at least one sampling run first."
          }
        />
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{locale === "zh-CN" ? "覆盖快照" : "Coverage Snapshot"}</CardTitle>
          </div>
          <GenerateAction
            endpoint={`/api/projects/${projectId}/semantic-coverage`}
            label={locale === "zh-CN" ? "生成覆盖分析" : "Generate coverage snapshot"}
            disabled={!runsReady}
            disabledReason={
              !runsReady
                ? locale === "zh-CN"
                  ? "先完成采样运行，再生成覆盖分析。"
                  : "Complete sampling first, then generate a coverage snapshot."
                : null
            }
          />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <CoverageTile label="Topic breadth" value={snapshot?.topicBreadth} />
          <CoverageTile label="Topic depth" value={snapshot?.topicDepth} />
          <CoverageTile label="Intent coverage" value={snapshot?.intentCoverage} />
          <CoverageTile label="Overall coverage" value={snapshot?.overallCoverage} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{locale === "zh-CN" ? "缺失概念" : "Missing Concepts"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {missingConcepts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {locale === "zh-CN" ? "还没有缺失概念数据。" : "No missing concept data yet."}
            </p>
          ) : (
            missingConcepts.map((concept, index) => (
              <div key={index} className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">{String((concept as Record<string, unknown>).keyword ?? "--")}</div>
                <div className="mt-1 text-muted-foreground">
                  {String((concept as Record<string, unknown>).keywordType ?? "concept")} / target weight{" "}
                  {Number((concept as Record<string, unknown>).targetWeight ?? 0).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}

function CoverageTile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold">
        {typeof value === "number" ? value.toFixed(2) : "--"}
      </div>
    </div>
  );
}

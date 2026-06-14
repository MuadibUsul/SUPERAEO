import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { Badge } from "@/components/ui/badge";
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

export default async function EntityPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Entity Intelligence">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  const runsReady = state.data._count.runs > 0;

  if (!runsReady) {
    return (
      <ProjectPageShell
        projectId={projectId}
        locale={locale}
        title={locale === "zh-CN" ? "实体情报" : "Entity Intelligence"}
        eyebrow={state.data.brandName}
        description={
          locale === "zh-CN"
            ? "先完成一次采样运行，系统才能开始构建品牌在 AI 世界模型中的实体快照。"
            : "Complete the first sampling run before the system can build an entity snapshot for the brand."
        }
        workflowState={state.data._count}
      >
        <StatusCallout
          title={locale === "zh-CN" ? "分析层尚未解锁" : "Analysis layer locked"}
          message={
            locale === "zh-CN"
              ? "实体情报依赖真实回答样本。请先完成问题库和至少一次采样运行。"
              : "Entity intelligence depends on real sampled answers. Finish the query set and at least one sampling run first."
          }
        />
      </ProjectPageShell>
    );
  }

  const [profile, edges] = await Promise.all([
    getPrisma().entityProfile.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
    getPrisma().semanticEdge.findMany({ where: { projectId }, orderBy: { weight: "desc" }, take: 12 }),
  ]);

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={locale === "zh-CN" ? "实体情报" : "Entity Intelligence"}
      eyebrow={state.data.brandName}
      description={
        locale === "zh-CN"
          ? "查看 AI 如何定义该品牌、与哪些主题相连，以及实体可信度和一致性。"
          : "See how AI defines the brand, which topics it connects to, and how stable that entity profile is."
      }
      workflowState={state.data._count}
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>{locale === "zh-CN" ? "AI 定义快照" : "AI Definition Snapshot"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-7 text-muted-foreground">
              {profile?.aiDefinition ??
                (locale === "zh-CN"
                  ? "当前还没有实体定义。完成采样与回答分析后，这里会出现 AI 对品牌的定义。"
                  : "No entity definition yet. After sampling and response analysis, the AI definition of the brand will appear here.")}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <ScoreTile label="Authority" value={profile?.authorityScore} />
              <ScoreTile label="Consistency" value={profile?.consistencyScore} />
              <ScoreTile label="Centrality" value={profile?.centralityScore} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{locale === "zh-CN" ? "关联图谱预览" : "Relationship Graph Preview"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {edges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {locale === "zh-CN"
                  ? "暂时还没有图谱边。后续接入 Graph Intelligence Service 和 Neo4j 后，这里会继续加深。"
                  : "No graph edges yet. This will deepen once Graph Intelligence and Neo4j are connected."}
              </p>
            ) : (
              edges.map((edge) => (
                <div key={edge.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{edge.sourceNode}</div>
                    <Badge variant="secondary">{edge.edgeType}</Badge>
                    <div className="text-sm font-medium">{edge.targetNode}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    weight {edge.weight.toFixed(2)} / confidence {edge.confidence.toFixed(2)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </ProjectPageShell>
  );
}

function ScoreTile({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold">
        {typeof value === "number" ? value.toFixed(2) : "--"}
      </div>
    </div>
  );
}

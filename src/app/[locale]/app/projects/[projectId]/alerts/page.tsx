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

export default async function AlertsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Alerts">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  const runsReady = state.data._count.runs > 0;
  const alerts = runsReady
    ? await getPrisma().alert.findMany({
        where: { projectId },
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
        take: 100,
      })
    : [];

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={locale === "zh-CN" ? "认知告警" : "Cognitive Alerts"}
      eyebrow={state.data.brandName}
      description={
        locale === "zh-CN"
          ? "识别 AI 对品牌的错误描述、虚构功能、错误关系和其他高风险认知偏差。"
          : "Inspect hallucinations, wrong relationships, unsupported claims, and other cognitive risks."
      }
      workflowState={state.data._count}
    >
      {!runsReady ? (
        <StatusCallout
          title={locale === "zh-CN" ? "分析层尚未解锁" : "Analysis layer locked"}
          message={
            locale === "zh-CN"
              ? "告警页建立在已分析的采样回答之上。请先完成至少一次采样运行。"
              : "Alerts depend on analyzed sampled answers. Complete at least one sampling run first."
          }
        />
      ) : null}

      <div className="space-y-4">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-sm text-muted-foreground">
              {locale === "zh-CN"
                ? "还没有告警。完成回答分析后，这里会显示 P1/P2/P3 认知风险。"
                : "No alerts yet. P1/P2/P3 risks will appear here after response analysis runs."}
            </CardContent>
          </Card>
        ) : (
          alerts.map((alert) => (
            <Card key={alert.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{alert.title}</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">{alert.message}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={alert.severity === "P1" ? "destructive" : "secondary"}>{alert.severity}</Badge>
                  <Badge variant="outline">{alert.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="text-muted-foreground">confidence {alert.confidence.toFixed(2)}</div>
                {alert.correctionSuggestion ? (
                  <div className="rounded-md bg-muted p-3">
                    <div className="font-medium">
                      {locale === "zh-CN" ? "建议修复动作" : "Suggested correction"}
                    </div>
                    <div className="mt-1 text-muted-foreground">{alert.correctionSuggestion}</div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </ProjectPageShell>
  );
}

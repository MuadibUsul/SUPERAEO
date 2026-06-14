import { notFound } from "next/navigation";
import { PlayCircle, RadioTower, TimerReset } from "lucide-react";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { CreateRunButton, ExecuteRunButton } from "@/components/workflow/run-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizeLocale } from "@/i18n/config";
import { getAIReadiness } from "@/server/ai/readiness";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function RunsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Sampling Runs">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  const prisma = getPrisma();
  const [runs, queryCount, aiReadiness] = await Promise.all([
    prisma.samplingRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { responses: true } } },
    }),
    prisma.aeoQuery.count({ where: { projectId } }),
    getAIReadiness(),
  ]);

  const disableCreate = queryCount === 0 || !aiReadiness.ready;
  const runWarning =
    queryCount === 0
      ? locale === "zh-CN"
        ? "请先生成问题库，再创建采样运行。"
        : "Generate queries before creating a sampling run."
      : locale === "zh-CN"
        ? aiReadiness.code === "missing_api_key"
          ? "已启用 Provider，但尚未配置 API Key。请先在运营后台补齐后端密钥。"
          : "请先在运营后台启用可用 Provider，并配置后端 API Key。"
        : aiReadiness.code === "missing_api_key"
          ? "The enabled provider is missing its API key. Add the backend key in the operator console first."
          : "Enable a working provider and backend API key in the operator console first.";

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={locale === "zh-CN" ? "采样运行" : "Sampling Runs"}
      eyebrow={state.data.brandName}
      description={
        locale === "zh-CN"
          ? "创建 baseline 或 retest 运行，并通过已配置的 AI Provider 对真实查询进行采样。"
          : "Create baseline or retest runs and sample real queries through the configured AI provider."
      }
      workflowState={state.data._count}
    >
      {disableCreate ? <StatusCallout title="Workflow prerequisite" message={runWarning ?? ""} /> : null}
      {!aiReadiness.queueReady ? (
        <StatusCallout
          title={locale === "zh-CN" ? "当前为轻量执行模式" : "Running in lightweight execution mode"}
          message={
            locale === "zh-CN"
              ? "未配置 Redis，因此运行不会进入后台队列；点击 Execute 时会直接在当前请求里执行采样。"
              : "Redis is not configured, so runs will not enter a background queue. Execute will fall back to direct in-request sampling."
          }
        />
      ) : null}

      <Card className="overflow-hidden border-border/70 bg-card/80">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">{runs.length} runs</CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {locale === "zh-CN"
                ? "每次运行都会记录平台、模型、样本数、时间戳和原始回答，用于后续稳定性与置信区间分析。"
                : "Runs record platform, model, sample count, timestamps, and raw answers for later stability and confidence analysis."}
            </p>
          </div>
          <CreateRunButton projectId={projectId} disabled={disableCreate} disabledReason={runWarning} />
        </CardHeader>
        <CardContent className="pt-0">
          {runs.length === 0 ? (
            <div className="grid gap-4 py-6 lg:grid-cols-3">
              <RunHint
                icon={PlayCircle}
                title={locale === "zh-CN" ? "Baseline" : "Baseline"}
                body={
                  locale === "zh-CN"
                    ? "先记录第一次采样，用来观察品牌当前是否进入回答空间。"
                    : "Capture the first sampling baseline to see whether the brand enters the answer space today."
                }
              />
              <RunHint
                icon={TimerReset}
                title={locale === "zh-CN" ? "Retest" : "Retest"}
                body={
                  locale === "zh-CN"
                    ? "优化后用相同 Query 复测，比较引用、提及与稳定性变化。"
                    : "Repeat the same query set after optimization and compare citation, mention, and stability shifts."
                }
              />
              <RunHint
                icon={RadioTower}
                title={locale === "zh-CN" ? "Evidence" : "Evidence"}
                body={
                  locale === "zh-CN"
                    ? "每一次运行都保留样本和时间，避免把单次回答误判成真值。"
                    : "Each run keeps sample context and timing so a single answer is never treated as ground truth."
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queries</TableHead>
                  <TableHead>Responses</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Badge variant="secondary">{run.runType}</Badge>
                    </TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell className="font-mono">{run.selectedQueryIds.length}</TableCell>
                    <TableCell className="font-mono">{run._count.responses}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {run.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </TableCell>
                    <TableCell>
                      {["queued", "draft", "failed", "partially_failed"].includes(run.status) ? (
                        <ExecuteRunButton runId={run.id} disabled={!aiReadiness.ready} disabledReason={aiReadiness.reason} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}

function RunHint({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof PlayCircle;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

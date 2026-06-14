import { notFound } from "next/navigation";
import { KeyRound, ShieldAlert, Sparkles } from "lucide-react";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { GenerateAction, type GenerateProgressStep } from "@/components/workflow/generate-action";
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

export default async function KeywordsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Semantic Keywords">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  const [keywords, aiReadiness] = await Promise.all([
    getPrisma().semanticKeyword.findMany({
      where: { projectId },
      orderBy: [{ keywordType: "asc" }, { targetWeight: "desc" }],
    }),
    getAIReadiness(),
  ]);

  const progressSteps: GenerateProgressStep[] =
    locale === "zh-CN"
      ? [
          { key: "prepare", label: "整理品牌上下文", detail: "收集品牌、域名、行业和竞品信息。", startAt: 0 },
          { key: "generate", label: "等待模型生成", detail: "Provider 正在输出结构化语义关键词。", startAt: 3 },
          { key: "validate", label: "校验 JSON 结构", detail: "系统会验证字段、枚举和值域是否合法。", startAt: 9 },
          { key: "repair", label: "必要时自动修复", detail: "如果模型输出格式不规范，会追加一次修复请求。", startAt: 13 },
          { key: "persist", label: "写入数据库", detail: "只有通过校验的结果才会落库。", startAt: 17 },
        ]
      : [
          { key: "prepare", label: "Preparing context", detail: "Collecting brand, domain, industry, and competitor inputs.", startAt: 0 },
          { key: "generate", label: "Waiting for generation", detail: "The provider is producing structured semantic keywords.", startAt: 3 },
          { key: "validate", label: "Validating JSON", detail: "We check fields, enums, and numeric ranges before writing.", startAt: 9 },
          { key: "repair", label: "Repairing if needed", detail: "A second pass runs only when the model output is malformed.", startAt: 13 },
          { key: "persist", label: "Saving results", detail: "Only validated output is persisted.", startAt: 17 },
        ];

  const copy =
    locale === "zh-CN"
      ? {
          title: "语义关键词",
          description: "生成 25-30 个目标概念，覆盖品类、场景、属性、意图、竞品和风险。",
          summary: "生成结果会先通过 JSON 校验，再写入数据库。",
          button: "生成关键词",
          progressTitle: "正在生成语义关键词",
          progressDescription: "系统会整理品牌上下文、等待模型输出、校验 JSON，并在通过后写入数据库。",
          estimatedNote: "当前进度是按流程估算展示，不是后端实时阶段回传。",
          delayedNote: "如果长时间停在最后一步，通常是模型响应或 JSON 修复比预估更久，而不是数据库写入本身很慢。",
          emptyTitle: "先建立品牌的语义骨架",
          emptyBody:
            "关键词不是装饰，它决定后续 Query、Sampling 和 Gap Analysis 的目标空间。建议先生成一版，再结合业务语境做二次整理。",
          emptyPoints: ["Category", "Scenario", "Attribute", "Intent", "Competitor", "Risk"],
          providerWarningTitle: "AI Provider 尚未就绪",
          providerWarningBody:
            aiReadiness.code === "missing_api_key"
              ? "已启用 Provider，但尚未配置 API Key。请先在运营后台补齐后端密钥。"
              : "请先在运营后台启用可用 Provider，并配置后端 API Key。",
          executionGuard:
            "这里保留真实入口，但在 Provider 尚未就绪前不会继续向下执行，避免出现前端可点、后端不可用的错位。",
        }
      : {
          title: "Semantic Keywords",
          description:
            "Generate 25-30 target concepts across category, scenario, attribute, intent, competitor, and risk.",
          summary: "Outputs are JSON-validated before they are stored.",
          button: "Generate keywords",
          progressTitle: "Generating semantic keywords",
          progressDescription:
            "We prepare brand context, wait for the model response, validate JSON, and then persist the output.",
          estimatedNote: "This progress view is an estimated workflow path, not a live backend stage feed.",
          delayedNote:
            "If it lingers near the final step, the usual cause is slower model generation or a JSON repair pass, not the database write itself.",
          emptyTitle: "Start by building the brand semantic frame",
          emptyBody:
            "Keywords define the target space for later Query, Sampling, and Gap Analysis work. Generate a first pass, then refine it with business context.",
          emptyPoints: ["Category", "Scenario", "Attribute", "Intent", "Competitor", "Risk"],
          providerWarningTitle: "AI provider not ready",
          providerWarningBody:
            aiReadiness.code === "missing_api_key"
              ? "The enabled provider is missing its API key. Add the backend key in the operator console first."
              : "Configure an enabled provider and backend API key in the operator console before running generation.",
          executionGuard:
            "The real entry point stays visible, but execution is intentionally blocked until the provider is ready so the UI never promises backend behavior that is unavailable.",
        };

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={copy.title}
      eyebrow={state.data.brandName}
      description={copy.description}
      workflowState={state.data._count}
    >
      {!aiReadiness.ready ? (
        <StatusCallout title={copy.providerWarningTitle} message={copy.providerWarningBody} />
      ) : null}

      <Card className="overflow-hidden border-border/70 bg-card/80">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">{keywords.length} concepts</CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">{copy.summary}</p>
          </div>
          <GenerateAction
            endpoint={`/api/projects/${projectId}/keywords/generate`}
            label={copy.button}
            progressTitle={copy.progressTitle}
            progressDescription={copy.progressDescription}
            estimatedNote={copy.estimatedNote}
            delayedNote={copy.delayedNote}
            progressSteps={progressSteps}
            estimatedSeconds={18}
            disabled={!aiReadiness.ready}
            disabledReason={!aiReadiness.ready ? copy.providerWarningBody : null}
          />
        </CardHeader>
        <CardContent className="pt-0">
          {keywords.length === 0 ? (
            <div className="grid gap-4 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/40 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{copy.emptyTitle}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.emptyBody}</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {copy.emptyPoints.map((point, index) => (
                  <div key={point} className="rounded-2xl border border-border/70 bg-background/50 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                      <KeyRound className="h-4 w-4 text-primary" />
                      {point}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((keyword) => (
                  <TableRow key={keyword.id}>
                    <TableCell className="font-medium">{keyword.keyword}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{keyword.keywordType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{keyword.targetWeight.toFixed(2)}</TableCell>
                    <TableCell className="font-mono">
                      {keyword.confidence == null ? "-" : keyword.confidence.toFixed(2)}
                    </TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-muted-foreground">
                      {keyword.reason ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!aiReadiness.ready ? (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <p>{copy.executionGuard}</p>
          </CardContent>
        </Card>
      ) : null}
    </ProjectPageShell>
  );
}

import { notFound } from "next/navigation";
import { ListFilter, Sparkles } from "lucide-react";

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

export default async function QueriesPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Query Explorer">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  const prisma = getPrisma();
  const [queries, keywordCount, aiReadiness] = await Promise.all([
    prisma.aeoQuery.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: { targetKeyword: true },
    }),
    prisma.semanticKeyword.count({ where: { projectId } }),
    getAIReadiness(),
  ]);

  const progressSteps: GenerateProgressStep[] =
    locale === "zh-CN"
      ? [
          { key: "prepare", label: "整理输入条件", detail: "读取品牌、竞品和语义关键词。", startAt: 0 },
          { key: "generate", label: "生成买方问题", detail: "Provider 正在组合推荐、对比、风险和决策问题。", startAt: 3 },
          { key: "validate", label: "校验结构", detail: "系统检查 query type、persona、intent 等字段。", startAt: 10 },
          { key: "repair", label: "必要时修复", detail: "如果 JSON 不完整，会触发一次修复重试。", startAt: 15 },
          { key: "persist", label: "写入问题库", detail: "验证通过后才保存为正式 Query Library。", startAt: 20 },
        ]
      : [
          { key: "prepare", label: "Preparing inputs", detail: "Loading brand, competitor, and keyword context.", startAt: 0 },
          { key: "generate", label: "Generating buyer questions", detail: "The provider is composing recommendation, comparison, risk, and decision queries.", startAt: 3 },
          { key: "validate", label: "Validating structure", detail: "We verify query type, persona, intent, and related fields.", startAt: 10 },
          { key: "repair", label: "Repairing if needed", detail: "A repair retry runs only when the JSON is incomplete or malformed.", startAt: 15 },
          { key: "persist", label: "Saving query library", detail: "Only validated queries are persisted.", startAt: 20 },
        ];

  const missingKeywords = keywordCount === 0;
  const disableGenerate = !aiReadiness.ready || missingKeywords;

  const copy =
    locale === "zh-CN"
      ? {
          title: "问题库",
          description: "生成自然买方问题，用来测试品牌是否进入 AI 回答候选集。",
          summary: "问题覆盖推荐、对比、替代方案、价格、风险和采购决策场景。",
          button: "生成问题库",
          progressTitle: "正在生成问题库",
          progressDescription: "系统会结合品牌、竞品和语义关键词，生成真实买方问题，并在入库前进行结构校验。",
          estimatedNote: "当前进度是按流程估算展示，不是后端实时阶段回传。",
          delayedNote: "如果长时间停在最后一步，通常是模型生成或 JSON 修复更慢，不是数据库写入本身堵住了。",
          emptyTitle: "让产品进入真实问题链，而不是只停留在品牌词",
          emptyBody:
            "好的 Query Library 需要覆盖主问题、比较问题、风险问题和决策问题，这样采样结果才有商业解释力。",
          warning:
            missingKeywords
              ? "请先生成语义关键词，再生成问题库。"
              : aiReadiness.code === "missing_api_key"
                ? "已启用 Provider，但尚未配置 API Key。请先在运营后台补齐后端密钥。"
                : "请先在运营后台启用可用 Provider，并配置后端 API Key。",
        }
      : {
          title: "Query Explorer",
          description:
            "Generate natural buyer questions that test whether the brand enters sampled AI candidate sets.",
          summary:
            "Queries cover recommendations, comparisons, alternatives, pricing, risk, and buyer decisions.",
          button: "Generate queries",
          progressTitle: "Generating query library",
          progressDescription:
            "We combine brand context, competitors, and semantic keywords to build realistic buyer-intent questions.",
          estimatedNote: "This progress view is an estimated workflow path, not a live backend stage feed.",
          delayedNote:
            "If it lingers near the final step, the usual cause is slower model generation or a JSON repair pass, not the database write itself.",
          emptyTitle: "Move beyond brand terms into the real question chain",
          emptyBody:
            "A strong query library should cover core, comparison, risk, and decision questions so sampled answers become commercially meaningful.",
          warning:
            missingKeywords
              ? "Generate semantic keywords before building the query set."
              : aiReadiness.code === "missing_api_key"
                ? "The enabled provider is missing its API key. Add the backend key in the operator console first."
                : "Enable a working provider and backend API key in the operator console first.",
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
      {disableGenerate ? <StatusCallout title="Workflow prerequisite" message={copy.warning} /> : null}

      <Card className="overflow-hidden border-border/70 bg-card/80">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">{queries.length} queries</CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">{copy.summary}</p>
          </div>
          <GenerateAction
            endpoint={`/api/projects/${projectId}/queries/generate`}
            label={copy.button}
            body={{ minQueries: 50, maxQueries: 80 }}
            progressTitle={copy.progressTitle}
            progressDescription={copy.progressDescription}
            estimatedNote={copy.estimatedNote}
            delayedNote={copy.delayedNote}
            progressSteps={progressSteps}
            disabled={disableGenerate}
            disabledReason={disableGenerate ? copy.warning : null}
            estimatedSeconds={24}
          />
        </CardHeader>
        <CardContent className="pt-0">
          {queries.length === 0 ? (
            <div className="grid gap-4 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
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
              <div className="grid gap-3">
                {[
                  ["Recommendation", "Best tools, best platform, top alternatives"],
                  ["Comparison", "A vs B, migration, fit by team or use case"],
                  ["Risk", "Limitations, pricing concerns, trust signals"],
                ].map(([label, detail]) => (
                  <div key={label} className="rounded-2xl border border-border/70 bg-background/50 px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ListFilter className="h-4 w-4 text-primary" />
                      {label}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Keyword</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queries.map((query) => (
                  <TableRow key={query.id}>
                    <TableCell className="max-w-xl whitespace-normal font-medium">{query.queryText}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{query.queryType}</Badge>
                    </TableCell>
                    <TableCell>{query.persona ?? "-"}</TableCell>
                    <TableCell>{query.intent ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{query.targetKeyword?.keyword ?? "-"}</TableCell>
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

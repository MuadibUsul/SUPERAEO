import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EvidencePage({ params, searchParams }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const filters = await searchParams;
  const locale = normalizeLocale(rawLocale);
  const zh = locale === "zh-CN";
  const dictionary = getDictionary(locale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.app.evidence}><StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} /></ProjectPageShell>;
  }
  if (!state.data) notFound();

  const runId = value(filters.runId);
  const model = value(filters.model);
  const from = parsedDate(value(filters.from));
  const claimType = oneOf(value(filters.claimType), ["OBSERVATION", "INFERENCE", "EXTERNAL_FACT", "EXPERIMENT"] as const);
  const evidenceGrade = oneOf(value(filters.evidenceGrade), ["INSUFFICIENT", "DIRECTIONAL", "CORROBORATED", "CONFIRMATORY"] as const);
  const sourceStatus = oneOf(value(filters.sourceStatus), ["PENDING", "VERIFIED_REACHABLE", "SNAPSHOT_CREATED", "UNREACHABLE", "BLOCKED_BY_ROBOTS", "LOGIN_REQUIRED", "UNSAFE_URL", "FETCH_FAILED", "CONTENT_CHANGED"] as const);
  const claimLinkFilters = [
    ...(model ? [{ links: { some: { response: { model } } } }] : []),
    ...(sourceStatus ? [{ links: { some: { sourceSnapshot: { verificationStatus: sourceStatus } } } }] : []),
  ];
  const exportParams = new URLSearchParams(Object.entries({ runId, model, from: value(filters.from), claimType, evidenceGrade, sourceStatus }).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const prisma = getPrisma();
  const [runs, modelRows, claims, responses] = await Promise.all([
    prisma.samplingRun.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, createdAt: true, sampleCount: true } }),
    prisma.aIResponse.findMany({ where: { run: { projectId } }, distinct: ["model"], select: { model: true }, orderBy: { model: "asc" } }),
    prisma.evidenceClaim.findMany({
      where: { projectId, ...(runId ? { runId } : {}), ...(claimType ? { claimType } : {}), ...(evidenceGrade ? { evidenceGrade } : {}), ...(from ? { createdAt: { gte: from } } : {}), ...(claimLinkFilters.length ? { AND: claimLinkFilters } : {}) },
      include: { links: { include: { response: { select: { id: true, model: true, createdAt: true } }, sourceSnapshot: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.aIResponse.findMany({
      where: { run: { projectId, ...(runId ? { id: runId } : {}) }, ...(model ? { model } : {}), ...(from ? { createdAt: { gte: from } } : {}) },
      include: { query: true, provider: { select: { name: true } }, analysis: true, citationSources: { include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
  ]);

  return (
    <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.app.evidence} eyebrow={state.data.brandName} description={zh ? "模型观察、机器推断、外部来源与实验结果分层展示。" : "Model observations, machine inference, sources, and experiments are separated."} workflowState={state.data._count}>
      <StatusCallout title={zh ? "证据边界" : "Evidence boundary"} message={zh ? "模型回答只证明该次调用的输出；来源可达和机器支持判断也不等于事实认证。" : "A model answer proves only what that call returned. Reachability and machine support do not certify truth."} />
      <div className="grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="data-panel xl:sticky xl:top-6">
          <div className="border-b border-border px-4 py-3"><p className="eyebrow text-primary">{zh ? "筛选证据" : "Filter evidence"}</p></div>
          <form className="grid gap-4 p-4">
            <FilterSelect name="runId" label="Run" current={runId} options={runs.map((run) => [run.id, `${run.createdAt.toISOString().slice(0, 10)} · ${run.sampleCount}`])} />
            <FilterSelect name="model" label={zh ? "模型" : "Model"} current={model} options={modelRows.map((row) => [row.model, row.model])} />
            <FilterSelect name="claimType" label={zh ? "结论类型" : "Claim type"} current={claimType} options={["OBSERVATION", "INFERENCE", "EXTERNAL_FACT", "EXPERIMENT"].map(pair)} />
            <FilterSelect name="evidenceGrade" label={zh ? "证据等级" : "Evidence grade"} current={evidenceGrade} options={["INSUFFICIENT", "DIRECTIONAL", "CORROBORATED", "CONFIRMATORY"].map(pair)} />
            <FilterSelect name="sourceStatus" label={zh ? "来源状态" : "Source status"} current={sourceStatus} options={["VERIFIED_REACHABLE", "SNAPSHOT_CREATED", "UNREACHABLE", "LOGIN_REQUIRED", "UNSAFE_URL", "FETCH_FAILED", "CONTENT_CHANGED"].map(pair)} />
            <label className="text-xs font-medium text-muted-foreground">{zh ? "起始日期" : "From"}<input name="from" type="date" defaultValue={value(filters.from)} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background/45 px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/35" /></label>
            <div className="grid grid-cols-2 gap-2"><Button type="submit" size="sm">{zh ? "应用" : "Apply"}</Button><Button asChild variant="outline" size="sm"><Link href={`/${locale}/app/projects/${projectId}/evidence`}>{zh ? "清除" : "Clear"}</Link></Button></div>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-4"><Button asChild variant="ghost" size="sm"><a href={`/api/projects/${projectId}/evidence?${exportParams}`}>JSON</a></Button><Button asChild variant="ghost" size="sm"><a href={`/api/projects/${projectId}/evidence?${exportParams}&format=csv`}>CSV</a></Button></div>
          </form>
        </aside>

        <div className="grid gap-8">
          <section><SectionHeading label={zh ? "结构化结论" : "Structured claims"} count={claims.length} /><div className="data-panel mt-3 divide-y divide-border">{claims.length ? claims.map((claim) => <article key={claim.id} className="interactive-row p-5 hover:bg-muted/25"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{claim.claimType}</Badge><Badge variant="outline">{claim.evidenceGrade}</Badge><span className="font-mono text-[11px] text-muted-foreground">{claim.supportStatus}</span>{claim.machineAssessed ? <span className="ml-auto text-[11px] text-warning">{zh ? "机器评估" : "Machine assessed"}</span> : null}</div><p className="mt-4 max-w-4xl text-sm leading-6 text-foreground/90">{claim.statement}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[11px] text-muted-foreground"><span className="text-success">+{claim.supportingCount}</span> · <span className="text-danger">−{claim.opposingCount}</span> · ?{claim.uncertainCount} · {claim.methodVersion}</p><Button asChild variant="ghost" size="sm"><Link href={`/api/projects/${projectId}/evidence/${claim.id}`}>{zh ? "检查关系" : "Inspect links"}</Link></Button></div></article>) : <EmptyLedger text={zh ? "尚无结构化结论；旧报告会标记为历史证据不完整。" : "No structured claims yet; legacy reports remain incomplete."} />}</div></section>

          <section><SectionHeading label={zh ? "原始调用记录" : "Raw invocation ledger"} count={responses.length} /><div className="data-panel mt-3 divide-y divide-border">{responses.length ? responses.map((response) => <article key={response.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><h3 className="max-w-3xl text-sm font-medium leading-6">{response.userPrompt ?? response.query.queryText}</h3><span className="shrink-0 font-mono text-[11px] text-primary">{response.provider?.name ?? response.platform} / {response.model}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground"><span>{response.createdAt.toISOString()}</span><span>sample #{response.sampleIndex}</span><span>{response.region ?? "—"}</span><span>{response.evidenceStatus}</span></div><details className="group mt-4"><summary className="cursor-pointer text-xs font-medium text-primary marker:text-muted-foreground">{zh ? "完整回答与调用参数" : "Full answer and invocation parameters"}</summary><div className="mt-3 grid gap-3"><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/70 p-4 text-xs leading-6">{response.normalizedAnswer ?? response.rawResponse}</pre><pre className="overflow-auto rounded-lg border border-border bg-background/70 p-4 text-[11px] leading-5 text-muted-foreground">{JSON.stringify({ systemPrompt: response.systemPrompt, requestParams: response.requestParams, samplingConfig: response.samplingConfig, providerRequestId: response.providerRequestId, responseHash: response.responseHash, analysis: response.analysis }, null, 2)}</pre></div></details>{response.citationSources.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{response.citationSources.map((source) => { const snapshot = source.snapshots[0]; return <div key={source.id} className="rounded-lg border border-border bg-muted/25 p-3 text-xs"><a href={source.sourceUrl ?? "#"} rel="noreferrer" target="_blank" className="font-medium text-primary">{source.sourceTitle ?? source.sourceDomain ?? source.sourceUrl ?? "source"}</a><div className="mt-1 font-mono text-[10px] text-muted-foreground">{snapshot ? `${snapshot.verificationStatus} · ${snapshot.sourceClass}` : (zh ? "尚未核验" : "Not verified")}</div></div>; })}</div> : null}<Button asChild variant="ghost" size="sm" className="mt-3"><Link href={`/api/projects/${projectId}/responses/${response.id}`}>{zh ? "完整 JSON" : "Full JSON"}</Link></Button></article>) : <EmptyLedger text={dictionary.semanticIntelligence.states.noData} />}</div></section>
        </div>
      </div>
    </ProjectPageShell>
  );
}

function FilterSelect({ name, label, current, options }: { name: string; label: string; current?: string; options: string[][] }) { return <label className="text-xs font-medium text-muted-foreground">{label}<select name={name} defaultValue={current ?? ""} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background/45 px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/35"><option value="">All</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
function SectionHeading({ label, count }: { label: string; count: number }) { return <div className="flex items-end justify-between"><div><p className="eyebrow text-primary">Evidence ledger</p><h2 className="mt-1 text-lg font-semibold">{label}</h2></div><span className="font-mono text-xs text-muted-foreground">{count}</span></div>; }
function EmptyLedger({ text }: { text: string }) { return <div className="px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>; }
function value(input: string | string[] | undefined) { return typeof input === "string" ? input : undefined; }
function parsedDate(input?: string) { if (!input) return undefined; const result = new Date(`${input}T00:00:00.000Z`); return Number.isNaN(result.getTime()) ? undefined : result; }
function oneOf<T extends string>(input: string | undefined, values: readonly T[]) { return input && values.includes(input as T) ? input as T : undefined; }
function pair(item: string) { return [item, item]; }

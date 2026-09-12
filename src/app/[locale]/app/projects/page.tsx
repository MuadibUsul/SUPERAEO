import Link from "next/link";
import { ArrowRight, FolderKanban, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { listProjects } from "@/server/data/projects";
import { formatLimit, getPlanCopy } from "@/server/billing/plans";
import { getOrganizationUsage, type OrganizationUsage } from "@/server/billing/usage-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const projectListCopy = {
  "zh-CN": {
    badge: "WORKSPACE",
    description: "选择一个项目继续分析，或创建新的品牌、人物、网站与产品观察。",
    emptyTitle: "还没有审计项目",
    emptyMessage: "先创建一个品牌、人物、网站或产品。CIP 会把复杂的后台流程包装成一次清晰的 AI 认知审计。",
    questionMap: "问题地图",
    evidenceBatches: "采样批次",
    comparisonSet: "比较对象",
    openBrief: "打开认知简报",
    databaseUnavailable: "数据库不可用",
    planLabel: "当前套餐",
    renews: (n: number) => `${n} 天后续费`,
    manage: "查看定价",
  },
  en: {
    badge: "WORKSPACE",
    description: "Continue an existing project, or start observing a brand, person, website, or product.",
    emptyTitle: "No audit projects yet",
    emptyMessage: "Create a brand, person, website, or product. CIP wraps the backend workflow into one diagnosis.",
    questionMap: "Question map",
    evidenceBatches: "Evidence batches",
    comparisonSet: "Comparison set",
    openBrief: "Open cognition brief",
    databaseUnavailable: "Database unavailable",
    planLabel: "Current plan",
    renews: (n: number) => `Renews in ${n} days`,
    manage: "View pricing",
  },
} as const;

export default async function ProjectsPage({ params, searchParams }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = projectListCopy[locale];
  const session = await requirePageSession(locale);
  const state = await listProjects(session);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const allProjects = state.status === "ready" ? state.data : [];
  const projects = allProjects.filter(project => [project.name, project.brandName, project.industry, project.domain].join(" ").toLowerCase().includes(query.toLowerCase()));
  const organizationId = session.user.memberships[0]?.organizationId ?? null;
  const usage = organizationId ? await getOrganizationUsage(organizationId) : null;
  const renewDays = usage?.planRenewsInDays ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-primary">{copy.badge}</p>
            <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.035em] text-foreground">{locale === "zh-CN" ? "从这里，开始理解。" : "Your next insight starts here."}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-dim">{copy.description}</p>
          </div>
          <Button asChild size="lg">
            <Link href={`/${locale}/app/projects/new`}>
              <Plus className="h-4 w-4" />
              {dictionary.app.newProject}
            </Link>
          </Button>
      </div>

      {state.status !== "ready" ? <StatusCallout title={copy.databaseUnavailable} message={state.message} /> : null}

      {allProjects.length > 0 ? <form role="search" className="flex flex-wrap items-center gap-3"><Input name="q" defaultValue={query} aria-label={locale === "zh-CN" ? "搜索项目" : "Search projects"} placeholder={locale === "zh-CN" ? "搜索项目名称、品牌或网址…" : "Search name, brand, or website…"} className="max-w-sm bg-card" /><Button type="submit" variant="outline">{locale === "zh-CN" ? "搜索" : "Search"}</Button>{query ? <Link href={`/${locale}/app/projects`} className="text-xs text-muted-foreground underline">{locale === "zh-CN" ? "清除" : "Clear"}</Link> : null}<span className="text-xs text-muted-foreground">{projects.length} {locale === "zh-CN" ? "个项目" : "projects"}</span></form> : null}
      {query && allProjects.length > 0 && projects.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{locale === "zh-CN" ? "没有找到匹配的项目，请换个关键词。" : "No matching projects. Try another keyword."}</p> : null}
      {state.status === "ready" && allProjects.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          message={copy.emptyMessage}
          action={
            <Button asChild>
              <Link href={`/${locale}/app/projects/new`}>
                <Plus className="h-4 w-4" />
                {dictionary.app.newProject}
              </Link>
            </Button>
          }
        />
      ) : null}

      {projects.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[1fr_auto] items-center border-b border-border bg-muted/45 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid-cols-[1fr_330px_36px]">
            <span>{locale === "zh-CN" ? "审计对象" : "Audit subject"}</span>
            <span className="hidden lg:block">{locale === "zh-CN" ? "当前数据" : "Current data"}</span>
            <span />
          </div>
          <div className="divide-y divide-border">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/${locale}/app/projects/${project.id}/dashboard`}
              className="interactive-row group grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-5 hover:bg-accent/45 lg:grid-cols-[52px_1fr_330px_36px]"
            >
              <span className="flex size-12 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-sm">
                <FolderKanban className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-foreground">{project.name}</h2>
                  <Badge variant="outline" className="h-5 bg-background text-[10px]">{project.subjects[0]?.entityType ?? "BRAND"}</Badge>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {project.brandName}{project.industry ? ` · ${project.industry}` : ""}
                </p>
                {project.domain ? <p className="mt-1 truncate font-mono text-[11px] text-faint">{project.domain}</p> : null}
              </div>
              <div className="hidden grid-cols-3 gap-5 lg:grid">
                <ProjectCount label={copy.questionMap} value={project._count.queries} />
                <ProjectCount label={copy.evidenceBatches} value={project._count.runs} />
                <ProjectCount label={copy.comparisonSet} value={project._count.competitors} />
              </div>
              <span className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 group-hover:translate-x-0.5 group-hover:bg-background group-hover:text-primary">
                <ArrowRight className="size-4" />
              </span>
            </Link>
          ))}
          </div>
        </div>
      ) : null}
      {usage ? <details className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm text-muted-foreground">{locale === "zh-CN" ? "套餐与用量" : "Plan & usage"}</summary><div className="mt-4"><PlanUsageStrip usage={usage} renewDays={renewDays} locale={locale} copy={copy} /></div></details> : null}
    </div>
  );
}

function PlanUsageStrip({
  usage,
  renewDays,
  locale,
  copy,
}: {
  usage: OrganizationUsage;
  renewDays: number | null;
  locale: Locale;
  copy: (typeof projectListCopy)[Locale];
}) {
  const planCopy = getPlanCopy(locale);
  const planName = planCopy[usage.plan];

  return (
    <div className="panel flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
          {planName}
        </span>
        <div>
          <div className="text-xs text-faint">{copy.planLabel}</div>
          {renewDays !== null ? <div className="text-sm text-dim">{copy.renews(renewDays)}</div> : null}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 lg:max-w-2xl">
        {usage.metrics.map((metric) => {
          const pct = Math.min(100, Math.round((metric.used / Math.max(1, metric.limit)) * 100));
          const tone = metric.exceeded ? "var(--danger)" : pct >= 80 ? "var(--warning)" : "var(--success)";
          return (
            <div key={metric.key}>
              <div className="flex items-baseline justify-between gap-1 text-xs">
                <span className="text-faint">{planCopy.limitLabels[metric.key]}</span>
                <span className="font-mono text-dim">
                  {metric.used}/{formatLimit(metric.limit, locale)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
              </div>
            </div>
          );
        })}
      </div>

      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href={`/${locale}/pricing`}>{copy.manage}</Link>
      </Button>
    </div>
  );
}

function ProjectCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="metric-number text-lg font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] text-faint">{label}</div>
    </div>
  );
}

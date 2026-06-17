import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
};

const projectListCopy = {
  "zh-CN": {
    badge: "审计工作台",
    description: "先查看你已有的审计项目，再决定是否创建新的品牌、人物、网站或产品审计。",
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
    badge: "Audit workspace",
    description: "Review your existing audit projects first, then decide whether to create a new brand, person, website, or product audit.",
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

export default async function ProjectsPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = projectListCopy[locale];
  const session = await requirePageSession(locale);
  const state = await listProjects(session);
  const projects = state.status === "ready" ? state.data : [];
  const organizationId = session.user.memberships[0]?.organizationId ?? null;
  const usage = organizationId ? await getOrganizationUsage(organizationId) : null;
  const renewDays = usage?.planRenewsInDays ?? null;

  return (
    <div className="space-y-6">
      <div className="panel-strong p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="outline" className="gap-1.5 border-[oklch(0.85_0.15_85/25%)] bg-[oklch(0.85_0.15_85/10%)] text-[oklch(0.85_0.15_85)]">
              <Sparkles className="h-3.5 w-3.5" />
              {copy.badge}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{dictionary.app.projects}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-dim">{copy.description}</p>
          </div>
          <Button asChild size="lg" className="glow-gold">
            <Link href={`/${locale}/app/projects/new`}>
              <Plus className="h-4 w-4" />
              {dictionary.app.newProject}
            </Link>
          </Button>
        </div>
      </div>

      {usage ? <PlanUsageStrip usage={usage} renewDays={renewDays} locale={locale} copy={copy} /> : null}

      {state.status !== "ready" ? <StatusCallout title={copy.databaseUnavailable} message={state.message} /> : null}

      {state.status === "ready" && projects.length === 0 ? (
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
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    <p className="mt-1 font-mono text-xs text-faint">{project.domain}</p>
                  </div>
                  <Badge variant="outline">{project.subjects[0]?.entityType ?? "BRAND"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{project.brandName}</p>
                  <p className="mt-1 text-sm text-dim">{project.industry}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <ProjectCount label={copy.questionMap} value={project._count.queries} />
                  <ProjectCount label={copy.evidenceBatches} value={project._count.runs} />
                  <ProjectCount label={copy.comparisonSet} value={project._count.competitors} />
                </div>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/${locale}/app/projects/${project.id}/dashboard`}>
                    {copy.openBrief}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : null}
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
        <span className="rounded-lg bg-[oklch(0.85_0.15_85/14%)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.85_0.15_85)]">
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
          const tone = metric.exceeded ? "0.74 0.18 12" : pct >= 80 ? "0.85 0.15 85" : "0.82 0.15 162";
          return (
            <div key={metric.key}>
              <div className="flex items-baseline justify-between gap-1 text-xs">
                <span className="text-faint">{planCopy.limitLabels[metric.key]}</span>
                <span className="font-mono text-dim">
                  {metric.used}/{formatLimit(metric.limit, locale)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[oklch(0.92_0.04_255/10%)]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `oklch(${tone})` }} />
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
    <div className="panel-inset px-3 py-2">
      <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
      <div className="text-xs text-faint">{label}</div>
    </div>
  );
}

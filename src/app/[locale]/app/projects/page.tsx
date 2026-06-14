import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { listProjects } from "@/server/data/projects";

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

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.24)] backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge className="border-amber-200/20 bg-amber-200/10 text-amber-100" variant="outline">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {copy.badge}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal">{dictionary.app.projects}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">{copy.description}</p>
          </div>
          <Button asChild className="bg-amber-100 text-slate-950 hover:bg-amber-50">
            <Link href={`/${locale}/app/projects/new`}>
              <Plus className="h-4 w-4" />
              {dictionary.app.newProject}
            </Link>
          </Button>
        </div>
      </div>

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
            <Card key={project.id} className="border-white/10 bg-white/[0.045] text-white">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    <p className="mt-1 font-mono text-xs text-white/40">{project.domain}</p>
                  </div>
                  <Badge className="border-white/10 bg-white/8 text-white/62" variant="outline">
                    {project.subjects[0]?.entityType ?? "BRAND"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">{project.brandName}</p>
                  <p className="mt-1 text-sm text-white/54">{project.industry}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <ProjectCount label={copy.questionMap} value={project._count.queries} />
                  <ProjectCount label={copy.evidenceBatches} value={project._count.runs} />
                  <ProjectCount label={copy.comparisonSet} value={project._count.competitors} />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  asChild
                  variant="outline"
                  className="w-full border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white"
                >
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

function ProjectCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/18 px-3 py-2">
      <div className="font-mono text-lg font-semibold">{value}</div>
      <div className="text-xs text-white/42">{label}</div>
    </div>
  );
}

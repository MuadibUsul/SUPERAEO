import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { CompetitorManager } from "@/components/project/competitor-manager";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function CompetitorsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title="Competitors">
        <StatusCallout title="Database unavailable" message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) {
    notFound();
  }

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={locale === "zh-CN" ? "竞品管理" : "Competitor Management"}
      eyebrow={state.data.brandName}
      description={
        locale === "zh-CN"
          ? "维护后续语义关键词、问题库生成和差距分析所使用的竞品集合。"
          : "Maintain the competitor set used by keyword generation, query generation, and gap analysis."
      }
      workflowState={state.data._count}
    >
      <CompetitorManager projectId={projectId} initialCompetitors={state.data.competitors} />
    </ProjectPageShell>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

const advancedSegments = [
  "competitors",
  "keywords",
  "queries",
  "runs",
  "entity",
  "semantic-coverage",
  "question-territory",
  "alerts",
];

export default async function SettingsPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.marketingPages.settings;
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.app.settings}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }
  if (!state.data) notFound();

  const project = state.data;

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={dictionary.app.settings}
      eyebrow={project.brandName}
      description={copy.description}
      workflowState={project._count}
    >
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{copy.auditSubject}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Row label={copy.name} value={project.brandName} />
            <Row label={copy.website} value={project.domain} />
            <Row label={copy.category} value={project.industry} />
            <Row label={copy.market} value={project.targetMarket} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{dictionary.app.advanced}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {advancedSegments.map((segment) => (
              <Link
                key={segment}
                href={`/${locale}/app/projects/${projectId}/${segment}`}
                className="flex items-center justify-between rounded-md border border-border bg-muted px-3 py-3 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {labelFor(segment, dictionary.app)}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </ProjectPageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <span>{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function labelFor(segment: string, app: Record<string, unknown>) {
  const key =
    segment === "semantic-coverage"
      ? "coverage"
      : segment === "question-territory"
        ? "questionTerritory"
        : segment;
  const value = app[key];
  return typeof value === "string" ? value : segment;
}

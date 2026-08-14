import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { SemanticJobAction } from "@/components/semantic-intelligence/semantic-job-action";
import { OpportunityBoard } from "@/components/semantic-intelligence/opportunity-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusCallout } from "@/components/ui/status-callout";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { requirePageSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

type OpportunityRow = {
  id: string;
  question: string;
  scenario: string;
  intent: string;
  longTailOccupationPotential: number;
  difficulty: string;
  priority: string;
  competitorWeaknessScore: number;
  answerInclusionPotential: number;
  recommendedContentAssets: string[];
};

export default async function OpportunitiesPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const laneLabels = dictionary.semanticIntelligence.opportunities.lanes;
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.semanticIntelligence.opportunities.title}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) notFound();
  const runsReady = state.data._count.runs > 0;
  const subject = state.data.subjects[0];
  const [snapshot, latestJob] = await Promise.all([
    subject
      ? getPrisma().longTailOpportunitySnapshot.findFirst({
          where: { projectId, subjectId: subject.id },
          orderBy: { createdAt: "desc" },
        })
      : null,
    getPrisma().analysisJob.findFirst({
      where: { projectId, jobType: "long_tail_opportunity_generation" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const summary = asRecord(snapshot?.summaryJson);
  const opportunities = Array.isArray(snapshot?.opportunityJson) ? (snapshot.opportunityJson as OpportunityRow[]) : [];

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={dictionary.semanticIntelligence.opportunities.title}
      eyebrow={state.data.brandName}
      description={dictionary.semanticIntelligence.opportunities.description}
      workflowState={state.data._count}
    >
      {!runsReady ? (
        <StatusCallout
          title={dictionary.semanticIntelligence.states.lockedTitle}
          message={dictionary.semanticIntelligence.states.lockedMessage}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile label={dictionary.semanticIntelligence.opportunities.p0} value={summary.p0Opportunities} />
        <MetricTile label={dictionary.semanticIntelligence.opportunities.highLop} value={summary.highLopOpportunities} />
        <MetricTile label={dictionary.semanticIntelligence.opportunities.lowCompetition} value={summary.lowCompetitionOpportunities} />
        <MetricTile label={dictionary.semanticIntelligence.opportunities.contentReady} value={summary.contentReadyOpportunities} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{dictionary.semanticIntelligence.concepts.longTailOpportunity}</CardTitle>
          <SemanticJobAction
            endpoint={`/api/projects/${projectId}/opportunities`}
            label={dictionary.semanticIntelligence.actions.generateOpportunities}
            disabled={!runsReady}
            latestJob={latestJob}
            copy={{
              latestJob: dictionary.semanticIntelligence.states.latestJob,
              latestStage: dictionary.semanticIntelligence.states.latestStage,
            }}
          />
        </CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <p className="text-sm text-dim">{dictionary.semanticIntelligence.states.noData}</p>
          ) : (
            <OpportunityBoard
              opportunities={opportunities}
              labels={{
                lanes: laneLabels,
                difficulty: dictionary.semanticIntelligence.opportunities.difficulty,
                intent: dictionary.semanticIntelligence.opportunities.intent,
                competitorWeakness: dictionary.semanticIntelligence.opportunities.competitorWeakness,
                answerInclusionPotential: dictionary.semanticIntelligence.opportunities.answerInclusionPotential,
                questionCluster: dictionary.semanticIntelligence.evidenceDrawer.questionCluster,
                scenario: dictionary.semanticIntelligence.evidenceDrawer.scenario,
                scoreBreakdown: dictionary.semanticIntelligence.evidenceDrawer.scoreBreakdown,
                sourceEvidence: dictionary.semanticIntelligence.evidenceDrawer.sourceEvidence,
                recommendedAssets: dictionary.semanticIntelligence.evidenceDrawer.recommendedAssets,
                suggestedQueries: dictionary.semanticIntelligence.evidenceDrawer.suggestedQueries,
                missingEvidence: dictionary.semanticIntelligence.evidenceDrawer.missingEvidence,
                competitors: dictionary.semanticIntelligence.evidenceDrawer.competitors,
                noEvidence: dictionary.semanticIntelligence.evidenceDrawer.noEvidence,
                whyThisExists: dictionary.semanticIntelligence.opportunities.whyThisExists,
                openDetail: dictionary.semanticIntelligence.evidenceDrawer.openDetail,
                close: dictionary.semanticIntelligence.evidenceDrawer.close,
              }}
            />
          )}
        </CardContent>
      </Card>
    </ProjectPageShell>
  );
}

function MetricTile({ label, value }: { label: string; value: unknown }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-dim">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">{typeof value === "number" ? value : "--"}</div>
      </CardContent>
    </Card>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

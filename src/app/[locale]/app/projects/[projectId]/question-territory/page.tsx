import { notFound } from "next/navigation";

import { ProjectPageShell } from "@/components/layout/project-page-shell";
import { QuestionTerritoryExplorer } from "@/components/semantic-intelligence/question-territory-explorer";
import { SemanticJobAction } from "@/components/semantic-intelligence/semantic-job-action";
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

type TerritoryItem = {
  question: string;
  cluster: string;
  scenario: string;
  intent: string;
  winnerType: string;
  answerInclusionRate: number;
  recommendationSlotRate: number;
  competitorDominance: number;
  noClearWinnerRate: number;
  opportunityScore: number;
  difficulty: string;
  priority: string;
  topCompetitors: string[];
  reasonOwnership?: string[];
  evidence?: { excerpt: string }[];
  validationStatus?: "UNVALIDATED" | "INSUFFICIENT_EVIDENCE" | "VALIDATED";
  supportingSampleCount?: number;
  entityFitScore?: number;
  competitorWeaknessScore?: number;
  answerInclusionPotential?: number;
  contentFeasibilityScore?: number;
  conversionValueScore?: number;
  recommendedContentAssets?: string[];
  missingEvidence?: string[];
  suggestedProbeQueries?: string[];
};

type OpportunityDetail = {
  question: string;
  entityFitScore?: number;
  competitorWeaknessScore?: number;
  answerInclusionPotential?: number;
  contentFeasibilityScore?: number;
  conversionValueScore?: number;
  recommendedContentAssets?: string[];
  missingEvidence?: string[];
  suggestedProbeQueries?: string[];
};

export default async function QuestionTerritoryPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const session = await requirePageSession(locale);
  const state = await getProject(projectId, session);

  if (state.status !== "ready") {
    return (
      <ProjectPageShell projectId={projectId} locale={locale} title={dictionary.semanticIntelligence.territory.title}>
        <StatusCallout title={dictionary.semanticIntelligence.states.databaseUnavailable} message={state.message} />
      </ProjectPageShell>
    );
  }

  if (!state.data) notFound();
  const runsReady = state.data._count.runs > 0;
  const subject = state.data.subjects[0];
  const [snapshot, latestOpportunitySnapshot, latestJob] = await Promise.all([
    subject
      ? getPrisma().questionTerritorySnapshot.findFirst({
          where: { projectId, subjectId: subject.id },
          orderBy: { createdAt: "desc" },
        })
      : null,
    subject
      ? getPrisma().longTailOpportunitySnapshot.findFirst({
          where: { projectId, subjectId: subject.id },
          orderBy: { createdAt: "desc" },
        })
      : null,
    getPrisma().analysisJob.findFirst({
      where: { projectId, jobType: "question_territory_build" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const summary = asRecord(snapshot?.summaryJson);
  const opportunityDetails = Array.isArray(latestOpportunitySnapshot?.opportunityJson)
    ? (latestOpportunitySnapshot.opportunityJson as OpportunityDetail[])
    : [];
  const opportunityByQuestion = new Map(opportunityDetails.map((item) => [item.question, item]));
  const territory = (Array.isArray(snapshot?.territoryJson) ? (snapshot.territoryJson as TerritoryItem[]) : []).map((item) => ({
    ...opportunityByQuestion.get(item.question),
    ...item,
  }));
  const validatedTerritory = territory.filter((item) => item.validationStatus === "VALIDATED");
  const awaitingValidation = territory.length - validatedTerritory.length;

  return (
    <ProjectPageShell
      projectId={projectId}
      locale={locale}
      title={dictionary.semanticIntelligence.territory.title}
      eyebrow={state.data.brandName}
      description={dictionary.semanticIntelligence.territory.description}
      workflowState={state.data._count}
    >
      {!runsReady ? (
        <StatusCallout
          title={dictionary.semanticIntelligence.states.lockedTitle}
          message={dictionary.semanticIntelligence.states.lockedMessage}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <MetricTile label={dictionary.semanticIntelligence.territory.targetOwned} value={validatedTerritory.filter((item) => item.winnerType === "TARGET").length} />
        <MetricTile label={dictionary.semanticIntelligence.territory.competitorOwned} value={validatedTerritory.filter((item) => item.winnerType === "COMPETITOR").length} />
        <MetricTile label={dictionary.semanticIntelligence.territory.openTerritories} value={validatedTerritory.filter((item) => item.winnerType === "NO_CLEAR_WINNER").length} />
        <MetricTile label={dictionary.semanticIntelligence.territory.awaitingValidation} value={awaitingValidation} />
        <MetricTile label={dictionary.semanticIntelligence.territory.highOpportunity} value={summary.highOpportunity} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{dictionary.semanticIntelligence.concepts.questionTerritory}</CardTitle>
          <SemanticJobAction
            endpoint={`/api/projects/${projectId}/question-territory`}
            label={dictionary.semanticIntelligence.actions.buildTerritory}
            disabled={!runsReady}
            latestJob={latestJob}
            copy={{
              latestJob: dictionary.semanticIntelligence.states.latestJob,
              latestStage: dictionary.semanticIntelligence.states.latestStage,
            }}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {territory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{dictionary.semanticIntelligence.states.noData}</p>
          ) : (
            <QuestionTerritoryExplorer
              territory={territory}
              labels={{
                winner: dictionary.semanticIntelligence.territory.winner,
                opportunityScore: dictionary.semanticIntelligence.territory.opportunityScore,
                sampleQuestion: dictionary.semanticIntelligence.territory.sampleQuestion,
                clusterList: dictionary.semanticIntelligence.territory.clusterList,
                competitorDominance: dictionary.semanticIntelligence.concepts.competitorDominance,
                answerInclusionRate: dictionary.semanticIntelligence.concepts.answerInclusionRate,
                recommendationSlotRate: dictionary.semanticIntelligence.concepts.recommendationSlotRate,
                noClearWinnerRate: dictionary.semanticIntelligence.territory.noClearWinnerRate,
                questionCluster: dictionary.semanticIntelligence.evidenceDrawer.questionCluster,
                scenario: dictionary.semanticIntelligence.evidenceDrawer.scenario,
                scoreBreakdown: dictionary.semanticIntelligence.evidenceDrawer.scoreBreakdown,
                sourceEvidence: dictionary.semanticIntelligence.evidenceDrawer.sourceEvidence,
                competitors: dictionary.semanticIntelligence.evidenceDrawer.competitors,
                reasonOwnership: dictionary.semanticIntelligence.evidenceDrawer.reasonOwnership,
                noEvidence: dictionary.semanticIntelligence.evidenceDrawer.noEvidence,
                close: dictionary.semanticIntelligence.evidenceDrawer.close,
                summary: dictionary.semanticIntelligence.evidenceDrawer.summary,
                mapTitle: dictionary.semanticIntelligence.territory.mapTitle,
                mapDescription: dictionary.semanticIntelligence.territory.mapDescription,
                scoreOrder: dictionary.semanticIntelligence.territory.scoreOrder,
                noQuestions: dictionary.semanticIntelligence.territory.noQuestions,
                candidateTitle: dictionary.semanticIntelligence.territory.candidateTitle,
                candidateDescription: dictionary.semanticIntelligence.territory.candidateDescription,
                awaitingValidation: dictionary.semanticIntelligence.territory.awaitingValidation,
                predictedDifficulty: dictionary.semanticIntelligence.territory.predictedDifficulty,
                supportingSamples: dictionary.semanticIntelligence.territory.supportingSamples,
                whyCandidate: dictionary.semanticIntelligence.opportunities.whyThisExists,
                scoreSignals: dictionary.semanticIntelligence.evidenceDrawer.scoreBreakdown,
                recommendedAssets: dictionary.semanticIntelligence.evidenceDrawer.recommendedAssets,
                missingEvidence: dictionary.semanticIntelligence.evidenceDrawer.missingEvidence,
                suggestedQueries: dictionary.semanticIntelligence.evidenceDrawer.suggestedQueries,
                entityFit: dictionary.semanticIntelligence.opportunities.entityFit,
                competitorWeakness: dictionary.semanticIntelligence.opportunities.competitorWeakness,
                answerInclusionPotential: dictionary.semanticIntelligence.opportunities.answerInclusionPotential,
                contentFeasibility: dictionary.semanticIntelligence.opportunities.contentFeasibility,
                targetOwned: dictionary.semanticIntelligence.territory.targetOwned,
                competitorOwned: dictionary.semanticIntelligence.territory.competitorOwned,
                openTerritories: dictionary.semanticIntelligence.territory.openTerritories,
                difficultyLevels: dictionary.semanticIntelligence.territory.difficultyLevels,
                quadrants: dictionary.semanticIntelligence.territory.quadrants,
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
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold">{typeof value === "number" ? value : "--"}</div>
      </CardContent>
    </Card>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

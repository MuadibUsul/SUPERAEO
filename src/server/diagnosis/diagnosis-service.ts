import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

import { getPrisma } from "@/server/db";
import { updateAnalysisJobStage } from "@/server/jobs/stage";
import { buildCipMetricBundle } from "@/server/metrics/cip-metrics";
import { getAIReadiness } from "@/server/ai/readiness";
import { generateLongTailOpportunitySnapshot } from "@/server/opportunity/opportunity-service";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { executeSamplingRun } from "@/server/sampling/execute-run";
import { buildSemanticNebulaSnapshots } from "@/server/semantic-nebula/nebula-service";
import { generateQueriesRequestSchema } from "@/server/validation/workflow";
import { generateSemanticKeywordsForProject } from "@/server/workflow/keyword-service";
import { generateQueriesForProject } from "@/server/workflow/query-service";

export const diagnosisStages = [
  "DIAGNOSIS_UNDERSTANDING_ENTITY",
  "DIAGNOSIS_BUILDING_QUESTION_MAP",
  "DIAGNOSIS_SAMPLING_AI_ANSWERS",
  "DIAGNOSIS_MAPPING_SEMANTIC_FIELD",
  "DIAGNOSIS_FINDING_OPPORTUNITIES",
  "DIAGNOSIS_BUILDING_EVIDENCE_REPORT",
] as const;

export type DiagnosisStage = (typeof diagnosisStages)[number];

const defaultQueryOptions = generateQueriesRequestSchema.parse({
  minQueries: 24,
  maxQueries: 36,
  personaTypes: ["buyer", "marketer", "consumer"],
  regions: ["US"],
  contextModes: ["cold_start", "competitive_context"],
  queryDepthLevels: ["primary", "decision", "comparison", "risk"],
});

export async function runFullDiagnosis(input: {
  projectId: string;
  requestedByUserId?: string;
  analysisJobId?: string;
}) {
  const prisma = getPrisma();
  await setStage(input.analysisJobId, "DIAGNOSIS_UNDERSTANDING_ENTITY", {
    message: "Understanding the entity and preparing a clean audit baseline.",
  });

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: { competitors: true },
  });
  if (!project) throw new Error("Project not found.");

  const subject = await ensurePrimaryProjectSubject(project);
  const aiReadiness = await getAIReadiness();
  if (!aiReadiness.ready) {
    throw new Error(aiReadiness.reason);
  }

  const existingKeywordCount = await prisma.semanticKeyword.count({
    where: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] },
  });

  if (existingKeywordCount < 20) {
    await generateSemanticKeywordsForProject({
      projectId: input.projectId,
      requestedByUserId: input.requestedByUserId,
    });
  }

  await setStage(input.analysisJobId, "DIAGNOSIS_BUILDING_QUESTION_MAP", {
    message: "Building a question map that reflects real AI answer scenarios.",
    metadata: { existingKeywordCount },
  });

  const existingQueryCount = await prisma.aeoQuery.count({
    where: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] },
  });

  if (existingQueryCount < 10) {
    await generateQueriesForProject({
      projectId: input.projectId,
      requestedByUserId: input.requestedByUserId,
      options: defaultQueryOptions,
    });
  }

  const queries = await prisma.aeoQuery.findMany({
    where: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 36,
  });

  if (queries.length === 0) {
    throw new Error("No questions are available for sampling after query generation.");
  }

  await setStage(input.analysisJobId, "DIAGNOSIS_SAMPLING_AI_ANSWERS", {
    message: "Sampling observable AI answers for the question map.",
    metadata: { queryCount: queries.length },
  });

  const run = await prisma.samplingRun.create({
    data: {
      projectId: input.projectId,
      subjectId: subject.id,
      runType: "baseline",
      status: "running",
      platforms: ["openai"],
      sampleCountPerQuery: 1,
      selectedQueryIds: queries.map((query) => query.id),
      sampleCount: queries.length,
      samplingStrategy: {
        personas: ["buyer", "marketer", "consumer"],
        regions: ["US"],
        contextModes: ["cold_start", "competitive_context"],
        routingTier: "low_cost_sampling",
        source: "full_diagnosis",
      },
      scheduledAt: new Date(),
      traceId: randomUUID(),
    },
  });

  const executedRun = await executeSamplingRun(run.id, input.requestedByUserId);

  await setStage(input.analysisJobId, "DIAGNOSIS_MAPPING_SEMANTIC_FIELD", {
    message: "Mapping the entity semantic field from sampled answer evidence.",
    metadata: { runId: executedRun.id, runStatus: executedRun.status },
  });

  const nebulaSnapshots = await buildSemanticNebulaSnapshots({
    projectId: input.projectId,
    subjectId: subject.id,
    runId: executedRun.id,
    analysisJobId: input.analysisJobId,
  });

  await setStage(input.analysisJobId, "DIAGNOSIS_FINDING_OPPORTUNITIES", {
    message: "Finding long-tail answer spaces and building question territory.",
    metadata: { nebulaSnapshotCount: nebulaSnapshots.length },
  });

  const opportunityResult = await generateLongTailOpportunitySnapshot({
    projectId: input.projectId,
    subjectId: subject.id,
    requestedByUserId: input.requestedByUserId,
    analysisJobId: input.analysisJobId,
  });

  await setStage(input.analysisJobId, "DIAGNOSIS_BUILDING_EVIDENCE_REPORT", {
    message: "Building a concise evidence-backed AI cognition audit.",
    metadata: {
      opportunitySnapshotId: opportunityResult.snapshot.id,
      territorySnapshotId: opportunityResult.territorySnapshot.id,
    },
  });

  const report = await createDiagnosisReport({
    projectId: input.projectId,
    runId: executedRun.id,
    subjectId: subject.id,
    subjectName: subject.displayName,
  });

  return {
    projectId: input.projectId,
    subjectId: subject.id,
    runId: executedRun.id,
    reportId: report.id,
    semanticNebulaSnapshotIds: nebulaSnapshots.map((snapshot) => snapshot.id),
    opportunitySnapshotId: opportunityResult.snapshot.id,
    territorySnapshotId: opportunityResult.territorySnapshot.id,
  };
}

async function createDiagnosisReport(input: {
  projectId: string;
  runId: string;
  subjectId: string;
  subjectName: string;
}) {
  const prisma = getPrisma();
  const [metrics, latestNebula, opportunities, territory, alerts] = await Promise.all([
    buildCipMetricBundle(input.projectId, input.subjectId),
    prisma.semanticNebulaSnapshot.findFirst({
      where: { projectId: input.projectId, subjectId: input.subjectId, scope: "OVERALL" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.longTailOpportunitySnapshot.findFirst({
      where: { projectId: input.projectId, subjectId: input.subjectId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.questionTerritorySnapshot.findFirst({
      where: { projectId: input.projectId, subjectId: input.subjectId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.alert.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 12,
    }),
  ]);
  const opportunityItems = Array.isArray(opportunities?.opportunityJson)
    ? opportunities.opportunityJson.slice(0, 5)
    : [];
  const nebulaNodes = Array.isArray(latestNebula?.nodeJson) ? latestNebula.nodeJson.slice(0, 12) : [];
  const title = `${input.subjectName} AI Cognition Audit`;
  const snapshot = {
    version: "2026-05-20.fireplace.v1",
    generatedBy: "full_diagnosis",
    projectId: input.projectId,
    subjectId: input.subjectId,
    runId: input.runId,
    cognitionSummary: buildCognitionSummary(input.subjectName, metrics.metrics.aiVisibilityScore, opportunityItems.length),
    metrics,
    semanticPosition: {
      summary: latestNebula?.summaryJson ?? null,
      topNodes: nebulaNodes,
    },
    opportunities: {
      summary: opportunities?.summaryJson ?? null,
      topItems: opportunityItems,
    },
    questionTerritory: {
      summary: territory?.summaryJson ?? null,
    },
    risks: alerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      message: alert.message,
      status: alert.status,
      createdAt: alert.createdAt.toISOString(),
    })),
  } satisfies Prisma.InputJsonObject;

  return prisma.report.create({
    data: {
      projectId: input.projectId,
      runId: input.runId,
      title,
      format: "html",
      status: "ready",
      snapshot,
      html: renderReportHtml(title, snapshot.cognitionSummary),
    },
  });
}

function buildCognitionSummary(subjectName: string, visibilityScore: number, opportunityCount: number) {
  if (visibilityScore >= 0.7) {
    return `${subjectName} is already visible in observable AI answer space, with ${opportunityCount} prioritized long-tail opportunities to strengthen ownership.`;
  }
  if (visibilityScore >= 0.4) {
    return `${subjectName} has partial AI visibility, but the semantic field still needs clearer evidence and stronger answer inclusion paths.`;
  }
  return `${subjectName} is not yet strongly established in observable AI answer space; the next move is to build evidence around narrow, high-intent scenarios.`;
}

function renderReportHtml(title: string, summary: string) {
  return [
    `<article class="cip-report">`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(summary)}</p>`,
    `<p>Scores and recommendations in this report are backed by sampled AI answers and traceable evidence.</p>`,
    `</article>`,
  ].join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function setStage(
  analysisJobId: string | undefined,
  stage: DiagnosisStage,
  input: { message: string; metadata?: Record<string, unknown> },
) {
  await updateAnalysisJobStage({
    analysisJobId,
    stage,
    message: input.message,
    metadata: input.metadata,
  });
}

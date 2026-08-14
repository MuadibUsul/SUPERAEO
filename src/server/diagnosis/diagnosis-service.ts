import type { Prisma } from "@/generated/prisma/client";

import { materializeBrandProbeRunForDiagnosis } from "@/server/brand-probes/diagnosis-adapter";
import { createBrandProbeRunForProject } from "@/server/brand-probes/brand-probe-service";
import { runBrandProbeRun } from "@/server/brand-probes/probe-runner";
import { getPrisma } from "@/server/db";
import { updateAnalysisJobStage } from "@/server/jobs/stage";
import { getAIReadiness } from "@/server/ai/readiness";
import { getAuditUsageSummary } from "@/server/ai/usage-summary";
import { analyzeSiteReadiness } from "@/server/website-audit/site-readiness-service";
import { generateLongTailOpportunitySnapshot } from "@/server/opportunity/opportunity-service";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { buildReportSnapshot } from "@/server/report/report-snapshot";
import { buildSemanticNebulaSnapshotsFromExploration } from "@/server/semantic-nebula/nebula-service";
import { generateSemanticKeywordsForProject } from "@/server/workflow/keyword-service";
import { getTraceContext } from "@/server/observability/trace-context";

export const diagnosisStages = [
  "DIAGNOSIS_UNDERSTANDING_ENTITY",
  "DIAGNOSIS_BUILDING_QUESTION_MAP",
  "DIAGNOSIS_SAMPLING_AI_ANSWERS",
  "DIAGNOSIS_MAPPING_SEMANTIC_FIELD",
  "DIAGNOSIS_FINDING_OPPORTUNITIES",
  "DIAGNOSIS_BUILDING_EVIDENCE_REPORT",
] as const;

export type DiagnosisStage = (typeof diagnosisStages)[number];

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

  if (existingKeywordCount === 0) {
    await generateSemanticKeywordsForProject({
      projectId: input.projectId,
      requestedByUserId: input.requestedByUserId,
    });
  }

  await setStage(input.analysisJobId, "DIAGNOSIS_BUILDING_QUESTION_MAP", {
    message: "Building structured seed probes across semantic units, relations, contexts, evidence, and risks.",
    metadata: { existingKeywordCount },
  });

  const createdProbeRun = await createBrandProbeRunForProject({
    projectId: input.projectId,
    semanticExploration: true,
    analysisJobId: input.analysisJobId,
  });
  if (createdProbeRun.run.totalProbes === 0) throw new Error("No structured seed probes were generated.");

  await setStage(input.analysisJobId, "DIAGNOSIS_SAMPLING_AI_ANSWERS", {
    message: "Executing seed probes, measuring coverage gaps, and adding adaptive probes until saturation or budget stop.",
    metadata: {
      brandProbeRunId: createdProbeRun.run.id,
      seedProbeCount: createdProbeRun.run.totalProbes,
      algorithm: "seed_execute_gap_adapt_repeat",
    },
  });

  const brandProbeRun = await runBrandProbeRun({
    runId: createdProbeRun.run.id,
    analysisJobId: input.analysisJobId,
  });
  if (brandProbeRun.status === "failed") throw new Error("Structured semantic exploration failed.");
  const executedRun = await materializeBrandProbeRunForDiagnosis(brandProbeRun.id);

  await setStage(input.analysisJobId, "DIAGNOSIS_MAPPING_SEMANTIC_FIELD", {
    message: "Mapping the entity semantic field directly from structured units, relations, clusters, and evidence.",
    metadata: { runId: executedRun.id, brandProbeRunId: brandProbeRun.id, runStatus: executedRun.status },
  });

  const nebulaSnapshots = await buildSemanticNebulaSnapshotsFromExploration({
    projectId: input.projectId,
    subjectId: subject.id,
    brandProbeRunId: brandProbeRun.id,
    samplingRunId: executedRun.id,
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
  // Website audits additionally measure whether the site itself is answerable:
  // AI-side citation tells you whether you are used, on-site readiness tells you
  // whether you could be. Opt-in, and never fatal to the audit.
  const siteReadiness = await analyzeSiteReadiness({
    projectId: input.projectId,
    entityType: subject.entityType,
    websiteUrl: subject.websiteUrl ?? project.domain,
  });

  const traceId = getTraceContext()?.traceId;
  const usageSummary = traceId ? await getAuditUsageSummary(input.projectId, traceId) : null;

  return {
    projectId: input.projectId,
    siteReadiness,
    subjectId: subject.id,
    runId: executedRun.id,
    brandProbeRunId: brandProbeRun.id,
    reportId: report.id,
    semanticNebulaSnapshotIds: nebulaSnapshots.map((snapshot) => snapshot.id),
    opportunitySnapshotId: opportunityResult.snapshot.id,
    territorySnapshotId: opportunityResult.territorySnapshot.id,
    usageSummary,
  };
}

async function createDiagnosisReport(input: {
  projectId: string;
  runId: string;
  subjectId: string;
  subjectName: string;
}) {
  const prisma = getPrisma();
  const title = `${input.subjectName} AI Cognition Audit`;
  const snapshot = await buildReportSnapshot({
    projectId: input.projectId,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
  });
  const summary = summaryFromSnapshot(snapshot, input.subjectName);

  return prisma.report.create({
    data: {
      projectId: input.projectId,
      runId: input.runId,
      title,
      format: "html",
      status: "ready",
      snapshot,
      html: renderReportHtml(title, summary),
    },
  });
}

function summaryFromSnapshot(snapshot: Prisma.InputJsonValue, subjectName: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return `${subjectName} AI cognition report is ready.`;
  }
  const briefs = "briefs" in snapshot && snapshot.briefs && typeof snapshot.briefs === "object" && !Array.isArray(snapshot.briefs)
    ? snapshot.briefs as Record<string, unknown>
    : {};
  const en = briefs.en && typeof briefs.en === "object" && !Array.isArray(briefs.en) ? briefs.en as Record<string, unknown> : {};
  const summary = en.summary && typeof en.summary === "object" && !Array.isArray(en.summary) ? en.summary as Record<string, unknown> : {};
  return typeof summary.headline === "string" ? summary.headline : `${subjectName} AI cognition report is ready.`;
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

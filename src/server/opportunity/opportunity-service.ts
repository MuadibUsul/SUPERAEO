import type { Prisma, SubjectEntityType } from "@/generated/prisma/client";
import { getDefaultEnabledProvider } from "@/server/ai/provider-config";
import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { runJsonPrompt } from "@/server/ai/json-executor";
import {
  buildLongTailScenarioGeneratorPrompt,
  longTailScenarioGeneratorOutputSchema,
  longTailScenarioGeneratorPromptVersion,
} from "@/server/ai/prompts/opportunity/long-tail-scenario-generator";
import {
  buildQuestionClusterGeneratorPrompt,
  questionClusterGeneratorOutputSchema,
  questionClusterGeneratorPromptVersion,
} from "@/server/ai/prompts/opportunity/question-cluster-generator";
import { getPrisma } from "@/server/db";
import { updateAnalysisJobStage } from "@/server/jobs/stage";
import { buildQuestionTerritoryMap } from "@/server/opportunity/question-territory-builder";
import { buildContentAssets, scoreLongTailOpportunity } from "@/server/opportunity/opportunity-scorer";
import {
  type LongTailOpportunity,
  type OpportunityCandidateQuestion,
  type OpportunityIntent,
  opportunityVersion,
} from "@/server/opportunity/types";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";

export async function getLatestOpportunitySnapshot(projectId: string, subjectId?: string) {
  const prisma = getPrisma();
  const subject = subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: subjectId } })
    : await prisma.projectSubject.findFirst({ where: { projectId, isPrimary: true }, orderBy: { createdAt: "asc" } });
  if (!subject) return null;
  return prisma.longTailOpportunitySnapshot.findFirst({
    where: { projectId, subjectId: subject.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestQuestionTerritorySnapshot(projectId: string, subjectId?: string) {
  const prisma = getPrisma();
  const subject = subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: subjectId } })
    : await prisma.projectSubject.findFirst({ where: { projectId, isPrimary: true }, orderBy: { createdAt: "asc" } });
  if (!subject) return null;
  return prisma.questionTerritorySnapshot.findFirst({
    where: { projectId, subjectId: subject.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function generateLongTailOpportunitySnapshot(input: {
  projectId: string;
  subjectId?: string;
  requestedByUserId?: string;
  analysisJobId?: string;
}) {
  const prisma = getPrisma();
  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "OPPORTUNITY_GENERATING_SCENARIOS",
    message: "Generating long-tail scenarios for the entity.",
  });

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: { competitors: true },
  });
  if (!project) throw new Error("Project not found.");
  const subject = input.subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: input.subjectId } })
    : await ensurePrimaryProjectSubject(project);
  if (!subject) throw new Error("Project subject not found.");

  const [keywords, latestNebula, responses] = await Promise.all([
    prisma.semanticKeyword.findMany({ where: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] } }),
    prisma.semanticNebulaSnapshot.findFirst({
      where: { projectId: input.projectId, subjectId: subject.id, scope: "OVERALL" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aIResponse.findMany({
      where: { run: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] } },
      include: {
        query: true,
        analysis: true,
        probeResults: {
          where: { probeFamily: "answer_extraction" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const nebulaTerms = extractNebulaTerms(latestNebula?.nodeJson);
  const profile = asRecord(subject.profileJson);
  const competitors = project.competitors.map((competitor) => competitor.name);
  const desiredTerms = collectProfileTerms(profile, ["targetAssociations", "desiredAssociations", "benefits", "targetKeywords"]);
  const undesiredTerms = collectProfileTerms(profile, ["undesiredAssociations", "risks"]);

  const hasProvider = Boolean(await getDefaultEnabledProvider().catch(() => null));
  const scenarioOutput = hasProvider
    ? await generateScenariosWithAi({
        project,
        subject,
        competitors,
        desiredTerms,
        undesiredTerms,
        existingSemanticTerms: nebulaTerms.length ? nebulaTerms : keywords.map((keyword) => keyword.keyword),
        requestedByUserId: input.requestedByUserId,
      })
    : { scenarios: deterministicScenarios(subject.entityType, subject.displayName, keywords.map((keyword) => keyword.keyword)) };

  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "OPPORTUNITY_GENERATING_QUESTIONS",
    message: "Converting scenarios into natural user question clusters.",
  });

  const questionOutput = hasProvider
    ? await generateQuestionsWithAi({
        subject,
        scenarios: scenarioOutput.scenarios,
        requestedByUserId: input.requestedByUserId,
      })
    : { clusters: deterministicQuestionClusters(subject.entityType, subject.displayName, scenarioOutput.scenarios) };

  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "OPPORTUNITY_SCORING",
    message: "Scoring long-tail occupation potential with deterministic components.",
  });

  const candidates = flattenQuestionCandidates(questionOutput.clusters);
  const answerSpaceStats = summarizeAnswerSpace(responses, subject.displayName, competitors);
  const subjectTerms = [subject.displayName, project.industry, project.targetMarket, ...keywords.map((keyword) => keyword.keyword)];
  const positiveNebulaTerms = nebulaTerms.slice(0, 20);
  const opportunities = candidates.slice(0, 40).map((candidate, index) => {
    const scored = scoreLongTailOpportunity({
      candidate,
      subjectTerms,
      positiveNebulaTerms,
      competitorDominance: answerSpaceStats.competitorDominance,
      targetMentionRate: answerSpaceStats.targetMentionRate,
      hasSpecificRecommendations: ["RECOMMENDATION", "COMPARISON", "COMMERCIAL"].includes(candidate.intent),
      occupiedByCompetitors: answerSpaceStats.topCompetitors,
      evidence: answerSpaceStats.evidence,
    });
    const opportunity: LongTailOpportunity = {
      id: `opp-${index + 1}`,
      opportunityTitle: candidate.clusterName,
      opportunityType: candidate.opportunityType,
      question: candidate.question,
      questionCluster: candidate.clusterName,
      scenario: candidate.scenario,
      persona: candidate.persona,
      intent: candidate.intent,
      entityFitScore: scored.components.entityFit,
      competitorWeaknessScore: scored.components.competitorWeakness,
      answerInclusionPotential: scored.components.answerInclusionPotential,
      contentFeasibilityScore: scored.components.contentFeasibility,
      conversionValueScore: scored.components.conversionValue,
      longTailOccupationPotential: scored.longTailOccupationPotential,
      components: scored.components,
      difficulty: scored.difficulty,
      priority: scored.priority,
      recommendedContentAssets: buildContentAssets(candidate.question, candidate.scenario),
      evidence: answerSpaceStats.evidence,
      occupiedByCompetitors: answerSpaceStats.topCompetitors,
      missingEvidence: buildMissingEvidence(candidate.question, subject.entityType),
      suggestedProbeQueries: [candidate.question, ...buildFollowUpProbeQueries(candidate.question, subject.displayName)],
    };
    return opportunity;
  });

  const summary = {
    version: opportunityVersion,
    generationMode: hasProvider ? "ai_assisted_strict_json" : "deterministic_fallback_no_enabled_provider",
    totalOpportunities: opportunities.length,
    p0Opportunities: opportunities.filter((opportunity) => opportunity.priority === "P0").length,
    highLopOpportunities: opportunities.filter((opportunity) => opportunity.longTailOccupationPotential >= 80).length,
    lowCompetitionOpportunities: opportunities.filter((opportunity) => opportunity.competitorWeaknessScore >= 72).length,
    contentReadyOpportunities: opportunities.filter((opportunity) => opportunity.contentFeasibilityScore >= 80).length,
  };

  const snapshot = await prisma.longTailOpportunitySnapshot.create({
    data: {
      projectId: input.projectId,
      subjectId: subject.id,
      runId: responses[0]?.runId,
      version: opportunityVersion,
      opportunityJson: opportunities as Prisma.InputJsonValue,
      summaryJson: summary as Prisma.InputJsonValue,
    },
  });

  const territory = buildQuestionTerritoryMap({ opportunities, targetName: subject.displayName });
  const territorySnapshot = await prisma.questionTerritorySnapshot.create({
    data: {
      projectId: input.projectId,
      subjectId: subject.id,
      runId: responses[0]?.runId,
      version: opportunityVersion,
      territoryJson: territory.territory as Prisma.InputJsonValue,
      summaryJson: territory.summary as Prisma.InputJsonValue,
    },
  });

  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "TERRITORY_BUILDING_MAP",
    message: "Question territory map has been built from opportunity scores.",
    metadata: { opportunitySnapshotId: snapshot.id, territorySnapshotId: territorySnapshot.id },
  });

  return { snapshot, territorySnapshot };
}

export async function buildQuestionTerritorySnapshot(input: {
  projectId: string;
  subjectId?: string;
  analysisJobId?: string;
}) {
  const prisma = getPrisma();
  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "TERRITORY_BUILDING_MAP",
    message: "Building question territory map from latest opportunity snapshot.",
  });
  const subject = input.subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: input.subjectId } })
    : await prisma.projectSubject.findFirst({ where: { projectId: input.projectId, isPrimary: true }, orderBy: { createdAt: "asc" } });
  if (!subject) throw new Error("Project subject not found.");
  const latest = await getLatestOpportunitySnapshot(input.projectId, subject.id);
  const opportunities = latest && Array.isArray(latest.opportunityJson) ? (latest.opportunityJson as LongTailOpportunity[]) : [];
  const territory = buildQuestionTerritoryMap({ opportunities, targetName: subject.displayName });
  const snapshot = await prisma.questionTerritorySnapshot.create({
    data: {
      projectId: input.projectId,
      subjectId: subject.id,
      runId: latest?.runId,
      version: opportunityVersion,
      territoryJson: territory.territory as Prisma.InputJsonValue,
      summaryJson: {
        ...territory.summary,
        source: latest ? "latest_opportunity_snapshot" : "empty_no_opportunity_snapshot",
      } as Prisma.InputJsonValue,
    },
  });
  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "TERRITORY_BUILDING_MAP",
    message: latest
      ? "Question territory map has been built from latest opportunities."
      : "No opportunity snapshot exists yet; created an empty question territory snapshot.",
    metadata: { territorySnapshotId: snapshot.id, opportunitySnapshotId: latest?.id ?? null },
  });
  return snapshot;
}

async function generateScenariosWithAi(input: {
  project: { id: string; organizationId: string | null; industry: string; targetMarket: string; language: string };
  subject: { id: string; entityType: SubjectEntityType; displayName: string; market: string | null; language: string };
  competitors: string[];
  desiredTerms: string[];
  undesiredTerms: string[];
  existingSemanticTerms: string[];
  requestedByUserId?: string;
}) {
  const plan = await resolveTaskExecutionPlan({ task: "long_tail_scenario_generation", workUnits: 1 });
  const lane = plan.lanes[0];
  const prompt = buildLongTailScenarioGeneratorPrompt({
    entityType: input.subject.entityType,
    subjectName: input.subject.displayName,
    category: input.project.industry,
    targetAudience: input.subject.market,
    targetMarket: input.project.targetMarket,
    targetLocale: input.subject.language || input.project.language,
    targetAssociations: input.desiredTerms,
    undesiredAssociations: input.undesiredTerms,
    competitors: input.competitors,
    existingSemanticTerms: input.existingSemanticTerms,
  });
  const result = await runJsonPrompt({
    projectId: input.project.id,
    subjectId: input.subject.id,
    userId: input.requestedByUserId,
    organizationId: input.project.organizationId ?? undefined,
    providerId: lane.providerId,
    model: lane.model,
    promptName: "long_tail_scenario_generation",
    promptVersion: longTailScenarioGeneratorPromptVersion,
    system: prompt.system,
    prompt: prompt.prompt,
    schema: longTailScenarioGeneratorOutputSchema,
    schemaName: "long_tail_scenarios",
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function generateQuestionsWithAi(input: {
  subject: { id: string; projectId: string; entityType: SubjectEntityType; displayName: string; language: string };
  scenarios: unknown[];
  requestedByUserId?: string;
}) {
  const plan = await resolveTaskExecutionPlan({ task: "question_cluster_generation", workUnits: input.scenarios.length });
  const lane = plan.lanes[0];
  const prompt = buildQuestionClusterGeneratorPrompt({
    subjectName: input.subject.displayName,
    entityType: input.subject.entityType,
    scenarios: input.scenarios,
    locale: input.subject.language,
  });
  const result = await runJsonPrompt({
    projectId: input.subject.projectId,
    subjectId: input.subject.id,
    userId: input.requestedByUserId,
    providerId: lane.providerId,
    model: lane.model,
    promptName: "question_cluster_generation",
    promptVersion: questionClusterGeneratorPromptVersion,
    system: prompt.system,
    prompt: prompt.prompt,
    schema: questionClusterGeneratorOutputSchema,
    schemaName: "question_clusters",
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function flattenQuestionCandidates(clusters: unknown[]): OpportunityCandidateQuestion[] {
  return clusters.flatMap((cluster) => {
    const record = asRecord(cluster);
    const questions = Array.isArray(record.questions) ? record.questions : [];
    return questions.map((question) => {
      const questionRecord = asRecord(question);
      return {
        question: String(questionRecord.question ?? ""),
        clusterName: String(record.clusterName ?? "Long-tail Question Cluster"),
        scenario: String(record.scenario ?? record.clusterName ?? "Long-tail scenario"),
        persona: String(record.persona ?? "buyer"),
        intent: normalizeIntent(String(record.intent ?? "RECOMMENDATION")),
        opportunityType: "QUESTION_CLUSTER",
        naturalnessScore: Number(questionRecord.naturalnessScore ?? 78),
        specificityScore: Number(questionRecord.specificityScore ?? 74),
        commercialValueScore: Number(questionRecord.commercialValueScore ?? 68),
      } satisfies OpportunityCandidateQuestion;
    });
  }).filter((candidate) => candidate.question.trim().length >= 6);
}

function summarizeAnswerSpace(
  responses: {
    id: string;
    runId: string;
    normalizedAnswer: string | null;
    rawResponse: string;
    queryId: string;
    analysis: {
      brandMentioned: boolean;
      brandRecommended: boolean;
      competitorsMentioned: unknown;
      matchedKeywords: unknown;
      mentionContext: string | null;
    } | null;
    probeResults: Array<{ normalizedJson: unknown }>;
  }[],
  subjectName: string,
  competitors: string[],
) {
  const total = Math.max(1, responses.length);
  const targetMentioned = responses.filter((response) => targetMentionedInResponse(response)).length;
  const competitorCounts = new Map<string, number>();
  const evidence: LongTailOpportunity["evidence"] = [];
  for (const response of responses.slice(0, 30)) {
    const normalized = normalizedProbe(response);
    const normalizedEntities = Array.isArray(normalized.mentionedEntities)
      ? normalized.mentionedEntities
          .map((entity) => asRecord(entity).name)
          .filter((name): name is string => typeof name === "string")
      : [];
    const mentioned = normalizedEntities.length
      ? normalizedEntities.filter((entity) => entity.toLowerCase() !== subjectName.toLowerCase())
      : asStringArray(response.analysis?.competitorsMentioned);
    for (const competitor of mentioned) {
      competitorCounts.set(competitor, (competitorCounts.get(competitor) ?? 0) + 1);
    }
    if (targetMentionedInResponse(response) || mentioned.length > 0) {
      evidence.push({
        queryId: response.queryId,
        responseId: response.id,
        excerpt:
          (typeof normalized.mentionContext === "string" ? normalized.mentionContext : response.analysis?.mentionContext) ??
          (response.normalizedAnswer ?? response.rawResponse).slice(0, 220),
        competitors: mentioned,
        reasons: normalizedMatchedKeywords(normalized, response.analysis?.matchedKeywords).slice(0, 5),
      });
    }
  }
  const topCompetitors = Array.from(competitorCounts.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const competitorMentions = Array.from(competitorCounts.values()).reduce((totalCount, count) => totalCount + count, 0);
  return {
    targetMentionRate: targetMentioned / total,
    competitorDominance: Math.min(1, competitorMentions / total / Math.max(1, competitors.length ? 1 : 2)),
    topCompetitors,
    evidence: evidence.length
      ? evidence
      : [
          {
            excerpt: `No direct evidence for ${subjectName} yet; this opportunity should be validated with opportunity probes.`,
            competitors: [],
            reasons: [],
          },
        ],
  };
}

function targetMentionedInResponse(response: { analysis: { brandMentioned: boolean } | null; probeResults: Array<{ normalizedJson: unknown }> }) {
  const normalized = normalizedProbe(response);
  if (typeof normalized.targetMentioned === "boolean") return normalized.targetMentioned;
  return Boolean(response.analysis?.brandMentioned);
}

function normalizedProbe(response: { probeResults: Array<{ normalizedJson: unknown }> }) {
  const value = response.probeResults[0]?.normalizedJson;
  return asRecord(value);
}

function normalizedMatchedKeywords(normalized: Record<string, unknown>, fallback: unknown) {
  return Array.isArray(normalized.matchedKeywords) ? asStringArray(normalized.matchedKeywords) : asStringArray(fallback);
}

function deterministicScenarios(entityType: SubjectEntityType, subjectName: string, keywords: string[]) {
  const examples: Record<SubjectEntityType, string[]> = {
    BRAND: ["不想选大品牌时有什么小众替代", "办公室场景里有什么更合适的选择", "新手如何判断一个品牌是否可信"],
    PERSON: ["想找该领域独立顾问应该关注谁", "新手应该关注哪些专家", "谁适合讲这个细分问题"],
    WEBSITE: ["有哪些工具可以检查 AI 回答可见度", "小型网站如何做 AEO 诊断", "个人网站没流量怎么建设问答内容"],
    PRODUCT: ["适合办公室囤的低负担产品", "不想选大牌有什么小众替代", "购买前应该比较哪些差异点"],
  };
  return (examples[entityType] ?? examples.BRAND).map((question, index) => ({
    title: `${subjectName} long-tail scenario ${index + 1}`,
    description: question,
    scenarioType: index === 0 ? "ALTERNATIVE_TO_BIG_BRAND" : "MICRO_INTENT",
    targetPersona: "buyer",
    coreNeed: keywords[index % Math.max(1, keywords.length)] ?? question,
    commercialIntent: index === 0 ? "HIGH" : "MEDIUM",
    entityFitReason: "Derived from current project context and semantic terms.",
    exampleQuestions: [question],
  }));
}

function deterministicQuestionClusters(entityType: SubjectEntityType, subjectName: string, scenarios: unknown[]) {
  return scenarios.map((scenario, index) => {
    const record = asRecord(scenario);
    const baseQuestion = String(asArray(record.exampleQuestions)[0] ?? record.description ?? `When should I consider ${subjectName}?`);
    return {
      clusterName: String(record.title ?? `Question cluster ${index + 1}`),
      intent: index === 0 ? "RECOMMENDATION" : "PROBLEM_SOLVING",
      scenario: String(record.description ?? baseQuestion),
      persona: String(record.targetPersona ?? "buyer"),
      questions: [
        {
          question: baseQuestion,
          naturalnessScore: 82,
          specificityScore: entityType === "WEBSITE" ? 88 : 78,
          commercialValueScore: index === 0 ? 86 : 72,
        },
        {
          question: `${baseQuestion}，${subjectName} 适合吗？`,
          naturalnessScore: 76,
          specificityScore: 84,
          commercialValueScore: 78,
        },
      ],
    };
  });
}

function buildMissingEvidence(question: string, entityType: SubjectEntityType) {
  const base = ["FAQ or guide evidence for this exact question", "Clear entity facts that support inclusion in recommendation reasons"];
  if (entityType === "WEBSITE") return [...base, "Citable page sections and author credibility signals"];
  if (entityType === "PRODUCT") return [...base, "Product benefit proof, comparison copy, and usage scenarios"];
  if (entityType === "PERSON") return [...base, "Representative work, role clarity, and expertise proof"];
  return [...base, `Evidence page for: ${question}`];
}

function buildFollowUpProbeQueries(question: string, subjectName: string) {
  return [`${question} 请给出具体推荐列表`, `${question} ${subjectName} 是否应该被纳入候选？`];
}

function extractNebulaTerms(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item).term).filter((term): term is string => typeof term === "string")
    : [];
}

function collectProfileTerms(profile: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => asArray(profile[key])).filter((item): item is string => typeof item === "string");
}

function normalizeIntent(value: string): OpportunityIntent {
  const normalized = value.toUpperCase();
  if (["INFORMATIONAL", "COMMERCIAL", "TRANSACTIONAL", "NAVIGATIONAL", "COMPARISON", "PROBLEM_SOLVING", "RECOMMENDATION"].includes(normalized)) {
    return normalized as OpportunityIntent;
  }
  return "RECOMMENDATION";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

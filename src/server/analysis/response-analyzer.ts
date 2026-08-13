import type { Prisma } from "@/generated/prisma/client";
import { runJsonPrompt } from "@/server/ai/json-executor";
import {
  answerExtractorOutputSchema,
  answerExtractorPromptVersion,
  buildAnswerExtractorPrompt,
  toLegacyCitation,
  toNormalizedProbeJson,
} from "@/server/ai/prompts/answer-extractor";
import { getPrisma } from "@/server/db";
import { buildSubjectContext, ensurePrimaryProjectSubject } from "@/server/projects/subject-service";

function sentiment(value: string) {
  return ["positive", "neutral", "negative", "mixed", "unknown"].includes(value)
    ? (value as "positive" | "neutral" | "negative" | "mixed" | "unknown")
    : "unknown";
}

export async function analyzeResponse(responseId: string, userId?: string) {
  const prisma = getPrisma();
  const response = await prisma.aIResponse.findUnique({
    where: { id: responseId },
    include: {
      query: true,
      run: { include: { subject: true, project: { include: { competitors: true, keywords: true } } } },
    },
  });

  if (!response) {
    throw new Error("AI response not found.");
  }

  const project = response.run.project;
  const subject = response.run.subject ?? (await ensurePrimaryProjectSubject(project));
  const subjectContext = buildSubjectContext(project, subject, project.competitors);
  const prompt = buildAnswerExtractorPrompt({
    subject: subjectContext,
    keywords: project.keywords.map((keyword) => keyword.keyword),
    query: response.query.queryText,
    answer: response.normalizedAnswer ?? response.rawResponse,
    citations: response.citations,
  });

  const result = await runJsonPrompt({
    projectId: project.id,
    subjectId: subject.id,
    userId,
    organizationId: project.organizationId ?? undefined,
    promptName: "answer_extractor",
    promptVersion: answerExtractorPromptVersion,
    system: prompt.system,
    prompt: prompt.prompt,
    schema: answerExtractorOutputSchema,
    schemaName: "answer_extraction",
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  const data = result.data;
  const normalizedJson = toNormalizedProbeJson(data, subjectContext);
  const legacyCitations = data.citations.map(toLegacyCitation);
  const comparisonEntityNames = data.mentionedEntities
    .filter((entity) => entity.role === "comparison" && entity.name.trim().length > 0)
    .map((entity) => entity.name.trim());

  await prisma.probeResult.upsert({
    where: {
      responseId_probeFamily: {
        responseId,
        probeFamily: "answer_extraction",
      },
    },
    update: {
      subjectId: subject.id,
      runId: response.runId,
      queryId: response.queryId,
      normalizedJson: normalizedJson as Prisma.InputJsonValue,
      scoreJson: {
        confidence: data.confidence,
        authorityScore: data.entityProfile.authorityScore,
        consistencyScore: data.entityProfile.consistencyScore,
        centralityScore: data.entityProfile.centralityScore,
        entityAccuracy: data.entityAccuracy,
      },
      evidenceJson: {
        citations: data.citations,
        risks: data.risks,
        accuracyErrors: data.entityAccuracy.errorClaims,
        promptRunId: result.promptRunId,
      },
    },
    create: {
      subjectId: subject.id,
      runId: response.runId,
      responseId,
      queryId: response.queryId,
      probeFamily: "answer_extraction",
      normalizedJson: normalizedJson as Prisma.InputJsonValue,
      scoreJson: {
        confidence: data.confidence,
        authorityScore: data.entityProfile.authorityScore,
        consistencyScore: data.entityProfile.consistencyScore,
        centralityScore: data.entityProfile.centralityScore,
        entityAccuracy: data.entityAccuracy,
      },
      evidenceJson: {
        citations: data.citations,
        risks: data.risks,
        accuracyErrors: data.entityAccuracy.errorClaims,
        promptRunId: result.promptRunId,
      },
    },
  });

  await prisma.answerAnalysis.upsert({
    where: { responseId },
    update: {
      brandMentioned: data.targetMentioned,
      brandRecommended: data.targetRecommended,
      brandPosition: data.targetPosition,
      brandDescription: data.targetDescription,
      competitorsMentioned: comparisonEntityNames as Prisma.InputJsonValue,
      recommendationWinner: data.recommendationWinner,
      mentionContext: data.mentionContext,
      sentiment: sentiment(data.sentiment),
      matchedKeywords: data.matchedKeywords as Prisma.InputJsonValue,
      citationsUsed: legacyCitations as Prisma.InputJsonValue,
      possibleHallucinations: data.risks as Prisma.InputJsonValue,
      confidence: data.confidence,
      rawAnalysis: normalizedJson as Prisma.InputJsonValue,
    },
    create: {
      responseId,
      brandMentioned: data.targetMentioned,
      brandRecommended: data.targetRecommended,
      brandPosition: data.targetPosition,
      brandDescription: data.targetDescription,
      competitorsMentioned: comparisonEntityNames as Prisma.InputJsonValue,
      recommendationWinner: data.recommendationWinner,
      mentionContext: data.mentionContext,
      sentiment: sentiment(data.sentiment),
      matchedKeywords: data.matchedKeywords as Prisma.InputJsonValue,
      citationsUsed: legacyCitations as Prisma.InputJsonValue,
      possibleHallucinations: data.risks as Prisma.InputJsonValue,
      confidence: data.confidence,
      rawAnalysis: normalizedJson as Prisma.InputJsonValue,
    },
  });

  await prisma.citationSource.deleteMany({ where: { responseId } });
  if (data.citations.length > 0) {
    await prisma.citationSource.createMany({
      data: data.citations.map((citation) => ({
        projectId: project.id,
        responseId,
        sourceUrl: citation.sourceUrl,
        sourceDomain: citation.sourceDomain,
        sourceTitle: citation.sourceTitle,
        citationRank: citation.citationRank,
        citationContext: citation.citationContext,
        supportsBrand: citation.supportsTarget,
        confidence: citation.confidence,
      })),
    });
  }

  await prisma.entityProfile.upsert({
    where: {
      projectId_entityName: {
        projectId: project.id,
        entityName: subject.displayName,
      },
    },
    update: {
      aiDefinition: data.entityProfile.aiDefinition,
      authorityScore: data.entityProfile.authorityScore,
      consistencyScore: data.entityProfile.consistencyScore,
      centralityScore: data.entityProfile.centralityScore,
      cognitiveBias: data.entityProfile.cognitiveBias as Prisma.InputJsonValue,
      sourceEvidence: data.citations as Prisma.InputJsonValue,
    },
    create: {
      projectId: project.id,
      entityName: subject.displayName,
      entityType: subject.entityType,
      aiDefinition: data.entityProfile.aiDefinition,
      authorityScore: data.entityProfile.authorityScore,
      consistencyScore: data.entityProfile.consistencyScore,
      centralityScore: data.entityProfile.centralityScore,
      cognitiveBias: data.entityProfile.cognitiveBias as Prisma.InputJsonValue,
      sourceEvidence: data.citations as Prisma.InputJsonValue,
    },
  });

  await prisma.alert.deleteMany({ where: { responseId, alertType: "hallucination" } });
  if (data.risks.length > 0) {
    await prisma.alert.createMany({
      data: data.risks.map((hallucination) => ({
        projectId: project.id,
        responseId,
        alertType: "hallucination" as const,
        severity: hallucination.riskLevel,
        title: hallucination.claim.slice(0, 120),
        message: hallucination.reason,
        evidence: { evidence: hallucination.evidence, claim: hallucination.claim } as Prisma.InputJsonValue,
        correctionSuggestion: "Add or strengthen authoritative subject facts and citeable entity evidence.",
        confidence: hallucination.confidence,
      })),
    });
  }

  return data;
}

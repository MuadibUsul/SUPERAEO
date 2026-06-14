import { z } from "zod";

import type { SubjectContext } from "@/server/projects/subject-service";

export const answerExtractorPromptVersion = "2026-06-11.v1";

const sentimentSchema = z.enum(["positive", "neutral", "negative", "mixed", "unknown"]);

const citationSchema = z.object({
  sourceUrl: z.string().nullable(),
  sourceDomain: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  citationRank: z.number().int().nullable(),
  citationContext: z.string().nullable(),
  supportsTarget: z.boolean(),
  confidence: z.number().min(0).max(1),
});

const riskSchema = z.object({
  claim: z.string(),
  riskLevel: z.enum(["P1", "P2", "P3"]),
  reason: z.string(),
  evidence: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const answerExtractorOutputSchema = z.object({
  targetMentioned: z.boolean(),
  targetRecommended: z.boolean(),
  targetPosition: z.number().int().nullable(),
  targetDescription: z.string().nullable(),
  mentionedEntities: z
    .array(
      z.object({
        name: z.string(),
        entityType: z.string().nullable(),
        role: z.enum(["target", "comparison", "source", "concept", "unknown"]).default("unknown"),
        sentiment: sentimentSchema.default("unknown"),
        confidence: z.number().min(0).max(1).default(0.5),
      }),
    )
    .default([]),
  recommendationWinner: z.string().nullable(),
  mentionContext: z.string().nullable(),
  sentiment: sentimentSchema,
  matchedKeywords: z.array(z.string()).default([]),
  citations: z.array(citationSchema).default([]),
  risks: z.array(riskSchema).default([]),
  entityProfile: z.object({
    aiDefinition: z.string().nullable(),
    authorityScore: z.number().min(0).max(1),
    consistencyScore: z.number().min(0).max(1),
    centralityScore: z.number().min(0).max(1),
    cognitiveBias: z.array(z.string()).default([]),
  }),
  confidence: z.number().min(0).max(1),
});

export type AnswerExtractorOutput = z.infer<typeof answerExtractorOutputSchema>;

export function buildAnswerExtractorPrompt(input: {
  subject: SubjectContext;
  keywords: string[];
  query: string;
  answer: string;
  citations?: unknown;
}) {
  return {
    system:
      "You are a CIP cognitive intelligence analyst. Analyze only observable sampled answers and citations. Never claim access to hidden LLM state, weights, private memory, or model internals. Return strict JSON only.",
    prompt: [
      "Analyze this sampled AI answer for target cognition, citation evidence, entity definition, and hallucination risk.",
      "",
      `Entity type: ${input.subject.entityType}`,
      `Subject: ${input.subject.subjectName}`,
      `Website URL: ${input.subject.websiteUrl || "none"}`,
      `Category: ${input.subject.category}`,
      `Market: ${input.subject.market}`,
      `Desired understanding: ${input.subject.desiredUnderstanding || "none"}`,
      `Aliases: ${input.subject.aliases.join(", ") || "none"}`,
      `Comparisons: ${input.subject.comparisons.map((item) => `${item.name} (${item.category})`).join("; ") || "none"}`,
      `Target keywords: ${input.keywords.join(", ") || "none"}`,
      `Query: ${input.query}`,
      "",
      "Sampled answer:",
      input.answer,
      "",
      "Raw citations:",
      JSON.stringify(input.citations ?? null),
      "",
      "Return JSON with keys: targetMentioned, targetRecommended, targetPosition, targetDescription, mentionedEntities, recommendationWinner, mentionContext, sentiment, matchedKeywords, citations, risks, entityProfile, confidence.",
      "Use supportsTarget on each citation to show whether it substantiates the target subject, not a generic category claim.",
    ].join("\n"),
  };
}

export function toLegacyCitation(citation: AnswerExtractorOutput["citations"][number]) {
  return {
    sourceUrl: citation.sourceUrl,
    sourceDomain: citation.sourceDomain,
    sourceTitle: citation.sourceTitle,
    citationRank: citation.citationRank,
    citationContext: citation.citationContext,
    supportsBrand: citation.supportsTarget,
    confidence: citation.confidence,
  };
}

export function toNormalizedProbeJson(data: AnswerExtractorOutput, subject: SubjectContext) {
  return {
    schemaVersion: answerExtractorPromptVersion,
    subject: {
      subjectId: subject.subjectId,
      entityType: subject.entityType,
      subjectName: subject.subjectName,
      canonicalName: subject.canonicalName,
      websiteUrl: subject.websiteUrl,
      category: subject.category,
      market: subject.market,
      desiredUnderstanding: subject.desiredUnderstanding,
    },
    targetMentioned: data.targetMentioned,
    targetRecommended: data.targetRecommended,
    targetPosition: data.targetPosition,
    targetDescription: data.targetDescription,
    mentionedEntities: data.mentionedEntities,
    recommendationWinner: data.recommendationWinner,
    mentionContext: data.mentionContext,
    sentiment: data.sentiment,
    matchedKeywords: data.matchedKeywords,
    citations: data.citations,
    risks: data.risks,
    entityProfile: data.entityProfile,
    confidence: data.confidence,
  };
}

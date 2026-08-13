import { z } from "zod";

import type { SubjectContext } from "@/server/projects/subject-service";

export const answerExtractorPromptVersion = "2026-08-14.v3";

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

const entityAccuracySchema = z.object({
  factualAccuracy: z.number().min(0).max(1).default(0.5),
  featureAccuracy: z.number().min(0).max(1).default(0.5),
  identityConfusionRisk: z.number().min(0).max(1).default(0),
  parameterErrorRate: z.number().min(0).max(1).default(0),
  confidence: z.number().min(0).max(1).default(0.5),
  errorClaims: z
    .array(
      z.object({
        claim: z.string(),
        errorType: z.enum(["factual_error", "identity_confusion", "feature_error", "parameter_error", "unsupported_claim"]),
        reason: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .default([]),
});

const strictAnswerExtractorOutputSchema = z.object({
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
  entityAccuracy: entityAccuracySchema.default({
    factualAccuracy: 0.5,
    featureAccuracy: 0.5,
    identityConfusionRisk: 0,
    parameterErrorRate: 0,
    confidence: 0.5,
    errorClaims: [],
  }),
  confidence: z.number().min(0).max(1),
});

export const answerExtractorOutputSchema = z.preprocess(
  normalizeAnswerExtractorOutput,
  strictAnswerExtractorOutputSchema,
);

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
      "Score entityAccuracy from only the observable answer and the subject context:",
      "- factualAccuracy: whether stated facts about the subject match the provided subject context or are carefully qualified when unknown.",
      "- featureAccuracy: for PRODUCT/WEBSITE/BRAND, whether product/site/brand attributes and parameters are stated accurately; use 0.5 if not enough feature evidence.",
      "- identityConfusionRisk: chance the answer confuses the subject with a same-name or adjacent entity.",
      "- parameterErrorRate: share of concrete specs, dates, prices, capabilities, URLs, or attributes that appear wrong or unsupported.",
      "- If facts cannot be verified from the provided context or answer evidence, lower confidence instead of inventing a mistake.",
      "",
      "Return one JSON object using exactly this shape:",
      JSON.stringify({
        targetMentioned: false,
        targetRecommended: false,
        targetPosition: null,
        targetDescription: null,
        mentionedEntities: [
          { name: "entity name", entityType: null, role: "unknown", sentiment: "unknown", confidence: 0.5 },
        ],
        recommendationWinner: null,
        mentionContext: null,
        sentiment: "unknown",
        matchedKeywords: [],
        citations: [
          {
            sourceUrl: null,
            sourceDomain: null,
            sourceTitle: null,
            citationRank: null,
            citationContext: null,
            supportsTarget: false,
            confidence: 0.5,
          },
        ],
        risks: [{ claim: "claim text", riskLevel: "P3", reason: "reason", evidence: null, confidence: 0.5 }],
        entityProfile: { aiDefinition: null, authorityScore: 0.5, consistencyScore: 0.5, centralityScore: 0.5, cognitiveBias: [] },
        entityAccuracy: {
          factualAccuracy: 0.5,
          featureAccuracy: 0.5,
          identityConfusionRisk: 0,
          parameterErrorRate: 0,
          confidence: 0.5,
          errorClaims: [],
        },
        confidence: 0.5,
      }),
      "Allowed sentiment values: positive, neutral, negative, mixed, unknown. Allowed riskLevel values: P1, P2, P3.",
      "Use null for unknown nullable scalar values and [] for unknown lists. recommendationWinner must be a string or null, never an object.",
      "For mentionedEntities.role: use target for the subject itself, comparison for competing or alternative entities, source for cited publishers, concept for non-entity concepts, and unknown only when none applies.",
      "Use supportsTarget on each citation to show whether it substantiates the target subject, not a generic category claim.",
    ].join("\n"),
  };
}

function normalizeAnswerExtractorOutput(value: unknown) {
  const source = asRecord(value);
  if (!source) return value;

  return {
    targetMentioned: booleanValue(source.targetMentioned),
    targetRecommended: booleanValue(source.targetRecommended),
    targetPosition: nullableInteger(source.targetPosition),
    targetDescription: nullableString(source.targetDescription),
    mentionedEntities: arrayValue(source.mentionedEntities)
      .map(normalizeMentionedEntity)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    recommendationWinner: entityName(source.recommendationWinner),
    mentionContext: nullableString(source.mentionContext),
    sentiment: sentimentValue(source.sentiment),
    matchedKeywords: arrayValue(source.matchedKeywords).map(stringValue).filter(Boolean),
    citations: arrayValue(source.citations)
      .map(normalizeCitation)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    risks: arrayValue(source.risks)
      .map(normalizeRisk)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    entityProfile: normalizeEntityProfile(source.entityProfile),
    entityAccuracy: normalizeEntityAccuracy(source.entityAccuracy),
    confidence: scoreValue(source.confidence),
  };
}

function normalizeMentionedEntity(value: unknown) {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name, entityType: null, role: "unknown", sentiment: "unknown", confidence: 0.5 } : null;
  }
  const source = asRecord(value);
  const name = entityName(source?.name ?? source?.entity ?? source?.label);
  if (!source || !name) return null;
  const role = ["target", "comparison", "source", "concept", "unknown"].includes(String(source.role))
    ? String(source.role)
    : "unknown";
  return {
    name,
    entityType: nullableString(source.entityType),
    role,
    sentiment: sentimentValue(source.sentiment),
    confidence: scoreValue(source.confidence),
  };
}

function normalizeCitation(value: unknown) {
  const source = asRecord(value);
  if (!source) return null;
  return {
    sourceUrl: nullableString(source.sourceUrl ?? source.url),
    sourceDomain: nullableString(source.sourceDomain ?? source.domain),
    sourceTitle: nullableString(source.sourceTitle ?? source.title),
    citationRank: nullableInteger(source.citationRank ?? source.rank),
    citationContext: nullableString(source.citationContext ?? source.context),
    supportsTarget: booleanValue(source.supportsTarget ?? source.supportsBrand),
    confidence: scoreValue(source.confidence),
  };
}

function normalizeRisk(value: unknown) {
  if (typeof value === "string") {
    const claim = value.trim();
    return claim ? { claim, riskLevel: "P3", reason: claim, evidence: null, confidence: 0.35 } : null;
  }
  const source = asRecord(value);
  if (!source) return null;
  const claim = stringValue(source.claim ?? source.risk ?? source.description ?? source.text ?? source.reason);
  if (!claim) return null;
  return {
    claim,
    riskLevel: riskLevelValue(source.riskLevel ?? source.level ?? source.severity),
    reason: stringValue(source.reason ?? source.description) || claim,
    evidence: nullableString(source.evidence ?? source.context),
    confidence: scoreValue(source.confidence),
  };
}

function normalizeEntityProfile(value: unknown) {
  const source = asRecord(value);
  return {
    aiDefinition: nullableString(source?.aiDefinition ?? source?.definition),
    authorityScore: scoreValue(source?.authorityScore),
    consistencyScore: scoreValue(source?.consistencyScore),
    centralityScore: scoreValue(source?.centralityScore),
    cognitiveBias: arrayValue(source?.cognitiveBias).map(stringValue).filter(Boolean),
  };
}

function normalizeEntityAccuracy(value: unknown) {
  const source = asRecord(value);
  return {
    factualAccuracy: scoreValue(source?.factualAccuracy),
    featureAccuracy: scoreValue(source?.featureAccuracy),
    identityConfusionRisk: scoreValue(source?.identityConfusionRisk, 0),
    parameterErrorRate: scoreValue(source?.parameterErrorRate, 0),
    confidence: scoreValue(source?.confidence),
    errorClaims: arrayValue(source?.errorClaims)
      .map((item) => {
        const claim = asRecord(item);
        const text = stringValue(claim?.claim);
        const errorType = String(claim?.errorType ?? "unsupported_claim");
        if (!claim || !text) return null;
        return {
          claim: text,
          errorType: ["factual_error", "identity_confusion", "feature_error", "parameter_error", "unsupported_claim"].includes(errorType)
            ? errorType
            : "unsupported_claim",
          reason: stringValue(claim.reason) || text,
          confidence: scoreValue(claim.confidence),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  return stringValue(value) || null;
}

function entityName(value: unknown): string | null {
  if (typeof value === "string") return nullableString(value);
  const source = asRecord(value);
  return nullableString(source?.name ?? source?.entity ?? source?.label ?? source?.title);
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function scoreValue(value: unknown, fallback = 0.5) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function sentimentValue(value: unknown) {
  const sentiment = String(value ?? "unknown").toLowerCase();
  return ["positive", "neutral", "negative", "mixed", "unknown"].includes(sentiment) ? sentiment : "unknown";
}

function riskLevelValue(value: unknown) {
  const level = String(value ?? "P3").toUpperCase();
  if (["P1", "CRITICAL", "HIGH"].includes(level)) return "P1";
  if (["P2", "MEDIUM", "MODERATE"].includes(level)) return "P2";
  return "P3";
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
    entityAccuracy: data.entityAccuracy,
    confidence: data.confidence,
  };
}

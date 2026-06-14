import { z } from "zod";

import type { SubjectContext } from "@/server/projects/subject-service";

export const semanticKeywordPromptVersion = "2026-06-11.v1";

const keywordTypeSchema = z.enum([
  "category",
  "scenario",
  "attribute",
  "intent",
  "competitor",
  "risk",
]);

export function createSemanticKeywordOutputSchema(min = 25, max = 30) {
  return z.object({
    keywords: z
      .array(
        z.object({
          keyword: z.string().trim().min(1),
          keywordType: keywordTypeSchema,
          targetWeight: z.number().min(0).max(1),
          reason: z.string().trim().min(1),
          confidence: z.number().min(0).max(1),
        }),
      )
      .min(min)
      .max(max),
  });
}

export const semanticKeywordOutputSchema = createSemanticKeywordOutputSchema();

export type SemanticKeywordOutput = z.infer<typeof semanticKeywordOutputSchema>;

export function buildSemanticKeywordPrompt(input: {
  subject: SubjectContext;
  optionalSeedKeywords?: string[];
  keywordTypes?: string[];
  minKeywords?: number;
  maxKeywords?: number;
  avoidKeywords?: string[];
}) {
  return {
    system:
      "You are an AI Answer Inclusion analyst. You observe sampled AI answer space and semantic evidence. You never claim access to hidden model weights, hidden state, or private LLM internals. Return strict JSON only.",
    prompt: [
      `Generate ${input.minKeywords ?? 25}-${input.maxKeywords ?? 30} semantic keywords for an AI cognition baseline.`,
      `Group keywords across: ${(input.keywordTypes ?? ["category", "scenario", "attribute", "intent", "competitor", "risk"]).join(", ")}.`,
      "Each item must include keyword, keywordType, targetWeight from 0.0 to 1.0, reason, and confidence from 0.0 to 1.0.",
      "Use the project language where appropriate, but keep machine-readable fields in English.",
      "",
      `Entity type: ${input.subject.entityType}`,
      `Subject: ${input.subject.subjectName}`,
      `Website URL: ${input.subject.websiteUrl || "none"}`,
      `Category: ${input.subject.category}`,
      `Market: ${input.subject.market}`,
      `Desired understanding: ${input.subject.desiredUnderstanding || "none"}`,
      `Language: ${input.subject.language}`,
      `Aliases: ${input.subject.aliases.join(", ") || "none"}`,
      `Comparisons: ${input.subject.comparisons
        .map((comparison) => `${comparison.name} (${comparison.category}, ${comparison.domain ?? "no domain"})`)
        .join("; ") || "none"}`,
      `Optional seed keywords: ${(input.optionalSeedKeywords ?? []).join(", ") || "none"}`,
      `Avoid duplicates against: ${(input.avoidKeywords ?? []).join(" | ") || "none"}`,
      "",
      "Return JSON in this exact shape:",
      '{"keywords":[{"keyword":"string","keywordType":"category|scenario|attribute|intent|competitor|risk","targetWeight":0.8,"reason":"string","confidence":0.8}]}',
    ].join("\n"),
  };
}

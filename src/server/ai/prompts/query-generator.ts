import { z } from "zod";

import type { SubjectContext } from "@/server/projects/subject-service";

export const queryGeneratorPromptVersion = "2026-06-11.v1";

const queryTypeSchema = z.enum([
  "recommendation",
  "comparison",
  "alternative",
  "pricing",
  "use_case",
  "risk",
  "buyer_decision",
  "education",
  "best_tools",
  "implementation",
]);

export function createQueryGeneratorOutputSchema(min = 10, max = 100) {
  return z.object({
    queries: z
      .array(
        z.object({
          queryText: z.string().trim().min(10),
          queryType: queryTypeSchema,
          persona: z.string().trim().min(1),
          intent: z.string().trim().min(1),
          targetKeyword: z.string().trim().optional(),
          confidence: z.number().min(0).max(1),
        }),
      )
      .min(min)
      .max(max),
  });
}

export const queryGeneratorOutputSchema = createQueryGeneratorOutputSchema();

export type QueryGeneratorOutput = z.infer<typeof queryGeneratorOutputSchema>;

export function buildQueryGeneratorPrompt(input: {
  subject: SubjectContext;
  minQueries: number;
  maxQueries: number;
  personaTypes?: string[];
  regions?: string[];
  contextModes?: string[];
  queryDepthLevels?: string[];
  queryTypes?: string[];
  avoidQueries?: string[];
  keywords: { keyword: string; keywordType: string; targetWeight: number }[];
}) {
  return {
    system:
      "You are an AI Answer Inclusion query strategist. You design observable AI answer-space tests. You never claim access to hidden model internals. Return strict JSON only.",
    prompt: [
      `Generate ${input.minQueries}-${input.maxQueries} natural intent questions.`,
      "Cover recommendation, comparison, alternative, pricing, use case, risk, decision, best tools, category education, and implementation.",
      "Do not mention the target subject in every query.",
      "Include comparison-triggered queries, long-tail user questions, and questions that test whether the target subject enters the AI candidate set.",
      "",
      `Entity type: ${input.subject.entityType}`,
      `Subject: ${input.subject.subjectName}`,
      `Website URL: ${input.subject.websiteUrl || "none"}`,
      `Category: ${input.subject.category}`,
      `Market: ${input.subject.market}`,
      `Desired understanding: ${input.subject.desiredUnderstanding || "none"}`,
      `Language: ${input.subject.language}`,
      `Aliases: ${input.subject.aliases.join(", ") || "none"}`,
      `Persona types to cover: ${(input.personaTypes ?? []).join(", ") || "buyer, marketer, cto"}`,
      `Regions to cover: ${(input.regions ?? []).join(", ") || input.subject.market || "US"}`,
      `Context modes: ${(input.contextModes ?? []).join(", ") || "cold_start, competitive_context"}`,
      `Query depth levels: ${(input.queryDepthLevels ?? []).join(", ") || "primary, decision, risk, comparison"}`,
      `Allowed query types for this pass: ${(input.queryTypes ?? []).join(", ") || "all supported types"}`,
      `Comparisons: ${input.subject.comparisons
        .map((comparison) => `${comparison.name} (${comparison.category})`)
        .join("; ") || "none"}`,
      `Semantic keywords: ${input.keywords
        .map((keyword) => `${keyword.keyword} (${keyword.keywordType}, weight ${keyword.targetWeight})`)
        .join("; ")}`,
      `Avoid duplicates against: ${(input.avoidQueries ?? []).join(" | ") || "none"}`,
      "",
      "Return JSON in this exact shape:",
      '{"queries":[{"queryText":"string","queryType":"recommendation|comparison|alternative|pricing|use_case|risk|buyer_decision|education|best_tools|implementation","persona":"string","intent":"string","targetKeyword":"string","confidence":0.8}]}',
    ].join("\n"),
  };
}

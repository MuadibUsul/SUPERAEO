import { z } from "zod";

export const longTailScenarioGeneratorPromptVersion = "2026-05-19.v1";

export const longTailScenarioGeneratorOutputSchema = z.object({
  scenarios: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        scenarioType: z.enum([
          "MICRO_INTENT",
          "AUDIENCE_SEGMENT",
          "PAIN_POINT",
          "USE_CASE",
          "COMPARISON",
          "ALTERNATIVE_TO_BIG_BRAND",
        ]),
        targetPersona: z.string().trim().min(1),
        coreNeed: z.string().trim().min(1),
        commercialIntent: z.enum(["LOW", "MEDIUM", "HIGH"]),
        entityFitReason: z.string().trim().min(1),
        exampleQuestions: z.array(z.string().trim().min(4)).min(1).max(8),
      }),
    )
    .min(4)
    .max(16),
});

export type LongTailScenarioGeneratorOutput = z.infer<typeof longTailScenarioGeneratorOutputSchema>;

export function buildLongTailScenarioGeneratorPrompt(input: {
  entityType: string;
  subjectName: string;
  category?: string | null;
  targetAudience?: string | null;
  targetMarket?: string | null;
  targetLocale?: string | null;
  targetAssociations: string[];
  undesiredAssociations: string[];
  competitors: string[];
  existingSemanticTerms: string[];
}) {
  return {
    system:
      "You are a long-tail AI answer-space strategist. You identify observable answer inclusion opportunities, not hidden model internals. Return strict JSON only.",
    prompt: [
      "Generate low-competition, high-intent long-tail scenarios where this entity could credibly earn inclusion in AI answers.",
      "Do not generate generic cold keywords. Focus on natural user questions, micro-intents, niche scenarios, and content-buildable evidence gaps.",
      "",
      `Entity type: ${input.entityType}`,
      `Subject: ${input.subjectName}`,
      `Category/domain: ${input.category ?? "unknown"}`,
      `Target audience: ${input.targetAudience ?? "unknown"}`,
      `Target market: ${input.targetMarket ?? "unknown"}`,
      `Locale: ${input.targetLocale ?? "en"}`,
      `Desired associations: ${input.targetAssociations.join(", ") || "none"}`,
      `Undesired associations: ${input.undesiredAssociations.join(", ") || "none"}`,
      `Competitors: ${input.competitors.join(", ") || "none"}`,
      `Existing semantic terms: ${input.existingSemanticTerms.slice(0, 50).join(", ") || "none"}`,
      "",
      "Return JSON exactly shaped as:",
      '{"scenarios":[{"title":"string","description":"string","scenarioType":"MICRO_INTENT|AUDIENCE_SEGMENT|PAIN_POINT|USE_CASE|COMPARISON|ALTERNATIVE_TO_BIG_BRAND","targetPersona":"string","coreNeed":"string","commercialIntent":"LOW|MEDIUM|HIGH","entityFitReason":"string","exampleQuestions":["string"]}]}',
    ].join("\n"),
  };
}


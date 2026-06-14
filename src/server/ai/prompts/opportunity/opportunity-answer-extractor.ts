import { z } from "zod";

export const opportunityAnswerExtractorPromptVersion = "2026-05-19.v1";

export const opportunityAnswerExtractorOutputSchema = z.object({
  targetMentioned: z.boolean(),
  targetRecommended: z.boolean(),
  mentionedEntities: z
    .array(
      z.object({
        name: z.string(),
        entityRole: z.enum(["TARGET", "COMPETITOR", "GENERIC", "OTHER"]),
        mentionPosition: z.number().int().nullable(),
        isRecommended: z.boolean(),
        recommendationReasons: z.array(z.string()).default([]),
        sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"]),
      }),
    )
    .default([]),
  answerType: z.enum(["BRAND_LIST", "PRODUCT_LIST", "WEBSITE_LIST", "PERSON_LIST", "GENERAL_ADVICE", "MIXED", "UNKNOWN"]),
  hasSpecificRecommendations: z.boolean(),
  noClearWinner: z.boolean(),
  dominantCompetitors: z.array(z.string()).default([]),
  reasonsOwnedByTarget: z.array(z.string()).default([]),
  reasonsOwnedByCompetitors: z.array(z.string()).default([]),
  evidenceExcerpt: z.string(),
});

export type OpportunityAnswerExtractorOutput = z.infer<typeof opportunityAnswerExtractorOutputSchema>;

export function buildOpportunityAnswerExtractorPrompt(input: {
  subjectName: string;
  competitors: string[];
  question: string;
  answer: string;
}) {
  return {
    system:
      "You extract observable answer-space evidence from one sampled AI answer. Do not infer hidden model state. Return strict JSON only.",
    prompt: [
      "Extract whether the target entity or competitors appear in this sampled answer, whether they are recommended, and what recommendation reasons they own.",
      "",
      `Target entity: ${input.subjectName}`,
      `Competitors: ${input.competitors.join(", ") || "none"}`,
      `Question: ${input.question}`,
      "",
      "Sampled answer:",
      input.answer,
      "",
      "Return JSON exactly shaped as:",
      '{"targetMentioned":true,"targetRecommended":false,"mentionedEntities":[{"name":"string","entityRole":"TARGET|COMPETITOR|GENERIC|OTHER","mentionPosition":1,"isRecommended":true,"recommendationReasons":["string"],"sentiment":"POSITIVE|NEGATIVE|NEUTRAL|MIXED"}],"answerType":"BRAND_LIST|PRODUCT_LIST|WEBSITE_LIST|PERSON_LIST|GENERAL_ADVICE|MIXED|UNKNOWN","hasSpecificRecommendations":true,"noClearWinner":false,"dominantCompetitors":["string"],"reasonsOwnedByTarget":["string"],"reasonsOwnedByCompetitors":["string"],"evidenceExcerpt":"string"}',
    ].join("\n"),
  };
}


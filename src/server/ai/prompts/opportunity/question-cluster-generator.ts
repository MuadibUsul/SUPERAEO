import { z } from "zod";

export const questionClusterGeneratorPromptVersion = "2026-05-19.v1";

const intentSchema = z.enum([
  "INFORMATIONAL",
  "COMMERCIAL",
  "TRANSACTIONAL",
  "NAVIGATIONAL",
  "COMPARISON",
  "PROBLEM_SOLVING",
  "RECOMMENDATION",
]);

export const questionClusterGeneratorOutputSchema = z.object({
  clusters: z
    .array(
      z.object({
        clusterName: z.string().trim().min(1),
        intent: intentSchema,
        scenario: z.string().trim().min(1),
        persona: z.string().trim().min(1),
        questions: z
          .array(
            z.object({
              question: z.string().trim().min(6),
              naturalnessScore: z.number().min(0).max(100),
              specificityScore: z.number().min(0).max(100),
              commercialValueScore: z.number().min(0).max(100),
            }),
          )
          .min(1)
          .max(8),
      }),
    )
    .min(3)
    .max(18),
});

export type QuestionClusterGeneratorOutput = z.infer<typeof questionClusterGeneratorOutputSchema>;

export function buildQuestionClusterGeneratorPrompt(input: {
  subjectName: string;
  entityType: string;
  scenarios: unknown[];
  locale?: string | null;
}) {
  return {
    system:
      "You convert long-tail scenarios into natural user question clusters for observable AI answer-space probing. Return strict JSON only.",
    prompt: [
      "Create natural, user-like questions for these scenarios.",
      "Questions should be specific enough to reveal answer inclusion opportunities, competitor dominance, and no-clear-winner areas.",
      "",
      `Subject: ${input.subjectName}`,
      `Entity type: ${input.entityType}`,
      `Locale: ${input.locale ?? "en"}`,
      `Scenarios JSON: ${JSON.stringify(input.scenarios)}`,
      "",
      "Return JSON exactly shaped as:",
      '{"clusters":[{"clusterName":"string","intent":"INFORMATIONAL|COMMERCIAL|TRANSACTIONAL|NAVIGATIONAL|COMPARISON|PROBLEM_SOLVING|RECOMMENDATION","scenario":"string","persona":"string","questions":[{"question":"string","naturalnessScore":80,"specificityScore":80,"commercialValueScore":80}]}]}',
    ].join("\n"),
  };
}


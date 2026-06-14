import type { GeneratedProbe } from "@/server/brand-probes/types";

export function scoreProbeQuality(input: Pick<GeneratedProbe, "zone" | "questionType" | "prompt" | "variables">) {
  const prompt = input.prompt;
  const hasJson = /json/i.test(prompt);
  const hasScenario = Boolean(input.variables.scenario || input.variables.audience || input.variables.intent);
  const hasCompetitor = Array.isArray(input.variables.competitors) && input.variables.competitors.length > 0;
  const brandMentioned = typeof input.variables.brand === "string" && prompt.includes(String(input.variables.brand));

  const intentClarity = input.zone === input.questionType ? 0.9 : 0.78;
  const realism = hasScenario ? 0.9 : 0.72;
  const nonLeading = input.questionType === "implicit_recommendation" && brandMentioned ? 0.2 : 0.86;
  const parseability = hasJson ? 0.92 : 0.45;
  const discriminativePower = hasCompetitor || input.zone === "implicit_recommendation" ? 0.9 : 0.74;
  const uniqueness = Math.max(0.55, 1 - prompt.length / 1200);

  return round2(
    0.25 * intentClarity +
      0.2 * realism +
      0.15 * nonLeading +
      0.15 * parseability +
      0.15 * discriminativePower +
      0.1 * uniqueness,
  );
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

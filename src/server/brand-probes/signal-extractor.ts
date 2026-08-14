import type { Prisma } from "@/generated/prisma/client";
import { normalizeSignalValue, uniqueNormalized } from "@/server/brand-probes/normalizer";
import type { ProbeResponseJson } from "@/server/brand-probes/types";

type SignalType = "keyword" | "competitor" | "scenario" | "audience" | "risk" | "sentiment" | "recommendation" | "opportunity";

export function inferMentionedBrand(data: ProbeResponseJson, brandAliases: string[]) {
  if (data.mentioned_brand === true) return true;
  const aliases = brandAliases.map(normalizeMentionText).filter(Boolean);
  if (aliases.length === 0) return false;
  const values = [
    ...data.recommended_brands.map((item) => item.brand),
    ...data.keywords,
    ...data.competitors,
    ...data.scenarios,
    ...data.audiences,
    ...data.risk_words,
    ...data.opportunity_words,
    ...data.semantic_units.flatMap((unit) => [
      unit.canonicalLabel,
      unit.surfaceForm,
      unit.description,
      unit.subject,
      unit.predicate,
      unit.object,
      typeof unit.value === "string" ? unit.value : undefined,
      unit.condition,
    ]),
  ].filter((value): value is string => Boolean(value));
  return values.some((value) => {
    const normalized = normalizeMentionText(value);
    return aliases.some((alias) => normalized.includes(alias));
  });
}

export function extractSignals(input: {
  data: ProbeResponseJson;
  runId: string;
  responseId: string;
  projectId: string;
  subjectId?: string | null;
  probeId: string;
  brandAliases: string[];
}) {
  const signals: Prisma.ExtractedSignalCreateManyInput[] = [];
  const push = (signalType: SignalType, rawValue: string, score = 0, confidence = input.data.confidence ?? 0.5) => {
    const normalizedValue = normalizeSignalValue(rawValue, input.brandAliases);
    if (!normalizedValue) return;
    signals.push({
      runId: input.runId,
      responseId: input.responseId,
      projectId: input.projectId,
      subjectId: input.subjectId ?? null,
      probeId: input.probeId,
      signalType,
      rawValue,
      normalizedValue,
      score,
      confidence: confidence ?? 0.5,
    });
  };

  for (const item of uniqueNormalized(input.data.keywords, input.brandAliases)) push("keyword", item.raw, input.data.recommendation_score ?? 0);
  for (const item of uniqueNormalized(input.data.competitors, input.brandAliases)) push("competitor", item.raw);
  for (const item of uniqueNormalized(input.data.scenarios, input.brandAliases)) push("scenario", item.raw);
  for (const item of uniqueNormalized(input.data.audiences, input.brandAliases)) push("audience", item.raw);
  for (const item of uniqueNormalized(input.data.risk_words, input.brandAliases)) push("risk", item.raw, Math.max(0, Math.round(Math.abs(input.data.sentiment_score ?? 0) * 100)));
  for (const item of uniqueNormalized(input.data.opportunity_words, input.brandAliases)) push("opportunity", item.raw, input.data.recommendation_score ?? 0);
  for (const brand of input.data.recommended_brands) {
    push("recommendation", brand.brand, brand.score ?? input.data.recommendation_score ?? 0, input.data.confidence ?? 0.5);
  }
  if (input.data.sentiment_score !== null && input.data.sentiment_score !== undefined) {
    push("sentiment", String(input.data.sentiment_score), Math.round(input.data.sentiment_score * 100), input.data.confidence ?? 0.5);
  }
  return signals;
}

function normalizeMentionText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

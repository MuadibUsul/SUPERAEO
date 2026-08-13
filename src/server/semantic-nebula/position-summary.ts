/**
 * Position summary — the product's north star in words: "where does the model
 * place this entity?"
 *
 * Derived from the semantic field (nebula summary) the audit already produces,
 * so it works today with no embedding source. When the embedding vector space
 * lands, the same concept gains real 3D coordinates and a measured neighbour
 * distance; the shape here stays the caller's contract.
 *
 * Pure and bilingual so it can be unit-tested.
 */
import type { Locale } from "@/i18n/config";
import { stringOrEmpty } from "@/server/utils/coerce";

export type PositionSummary = {
  /** The meaning the model most strongly places the entity at. */
  anchor: string | null;
  /** Top meanings the entity owns. */
  ownedMeanings: string[];
  /** Who owns the neighbourhood the entity competes in. */
  nearestRival: string | null;
  /** What the entity is dangerously close to (confusion / negative). */
  confusion: string | null;
  /** Valuable meanings the entity is far from — the gaps to move toward. */
  gaps: string[];
  /** How located the entity is: strong / partial / unlocated. */
  clarity: "strong" | "partial" | "unlocated";
  /** One-sentence read of the position. */
  headline: string;
  /** Plain-language context for the risk and competing signal. */
  explanation: string | null;
};

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => stringOrEmpty(v)).filter(Boolean) : [];
}

export function buildPositionSummary(input: {
  subjectName: string;
  entityType?: string | null;
  nebulaSummary: Record<string, unknown>;
  locale: Locale;
}): PositionSummary {
  const zh = input.locale === "zh-CN";
  const entity = entityLabel(input.entityType, zh);
  const owned = list(input.nebulaSummary.strongestPositiveTerms);
  const rivals = list(input.nebulaSummary.competitorOwnedTerms);
  const confusions = list(input.nebulaSummary.strongestNegativeTerms).concat(list(input.nebulaSummary.riskTerms));
  const gaps = list(input.nebulaSummary.missingTerms);
  const totalTerms = Number(input.nebulaSummary.totalTerms) || 0;

  const anchor = owned[0] ?? null;
  const nearestRival = rivals[0] ?? null;
  const confusion = confusions[0] ?? null;

  const clarity: PositionSummary["clarity"] =
    totalTerms === 0 || !anchor ? "unlocated" : owned.length >= 3 && confusions.length <= 2 ? "strong" : "partial";

  let headline: string;
  let explanation: string | null = null;
  if (clarity === "unlocated") {
    headline = zh
      ? `目前还没有足够数据说明 AI 怎么理解${entity}。`
      : `There isn't enough data yet to show how AI understands ${entity}.`;
  } else if (zh) {
    headline = `从这次采样看，AI 最常把${entity}和「${anchor}」联系在一起。`;
    explanation =
      (confusion ? `需要注意：回答中也经常出现「${confusion}」，可能让用户产生错误理解。` : "") +
      (nearestRival ? `在竞争相关回答中，「${nearestRival}」出现得更突出。` : "");
  } else {
    headline = `In this sample, AI most often associates ${entity} with "${anchor}".`;
    explanation =
      (confusion ? `Watch out: "${confusion}" also appears often and may give users the wrong impression. ` : "") +
      (nearestRival ? `In competitive answers, "${nearestRival}" stands out more.` : "");
  }

  return { anchor, ownedMeanings: owned.slice(0, 3), nearestRival, confusion, gaps: gaps.slice(0, 3), clarity, headline, explanation: explanation || null };
}

function entityLabel(entityType: string | null | undefined, zh: boolean) {
  if (zh) {
    if (entityType === "PRODUCT") return "这款产品";
    if (entityType === "WEBSITE") return "这个网站";
    if (entityType === "PERSON") return "这个人";
    return "这个品牌";
  }
  if (entityType === "PRODUCT") return "this product";
  if (entityType === "WEBSITE") return "this website";
  if (entityType === "PERSON") return "this person";
  return "this brand";
}

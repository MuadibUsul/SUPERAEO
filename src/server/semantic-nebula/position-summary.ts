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
};

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => stringOrEmpty(v)).filter(Boolean) : [];
}

export function buildPositionSummary(input: {
  subjectName: string;
  nebulaSummary: Record<string, unknown>;
  locale: Locale;
}): PositionSummary {
  const zh = input.locale === "zh-CN";
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
  if (clarity === "unlocated") {
    headline = zh
      ? `AI 尚未在语义空间里稳定地定位 ${input.subjectName}——先完成一次完整审计。`
      : `AI hasn't placed ${input.subjectName} anywhere stable yet — run a full audit first.`;
  } else if (zh) {
    headline =
      `AI 把 ${input.subjectName} 最紧地放在「${anchor}」附近` +
      (confusion ? `，却危险地贴近「${confusion}」` : "") +
      (nearestRival ? `；这片区域由「${nearestRival}」占据。` : "。");
  } else {
    headline =
      `AI places ${input.subjectName} closest to "${anchor}"` +
      (confusion ? `, but dangerously near "${confusion}"` : "") +
      (nearestRival ? ` — and "${nearestRival}" owns that neighbourhood.` : ".");
  }

  return { anchor, ownedMeanings: owned.slice(0, 3), nearestRival, confusion, gaps: gaps.slice(0, 3), clarity, headline };
}

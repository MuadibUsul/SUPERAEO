/**
 * Cognition focus — turns a flat metric bundle into a prioritised view.
 *
 * The dashboard's job is to answer "what matters most, right now" — not to
 * list every number equally. This uses the entity-type profile
 * (`primaryMetrics`) to pick the ONE metric that leads, the biggest gap to
 * close, and the type-specific top risk; and it codes each AI model with one
 * brand-spectrum hue so the per-model breakdown reads at a glance.
 *
 * Pure and deterministic so it can be unit tested.
 */
import type { Locale } from "@/i18n/config";
import type { CipMetricBundle } from "@/server/metrics/cip-metrics";
import {
  getEntityMetricLabel,
  getEntityProfile,
  type EntityMetricKey,
} from "@/server/entity/entity-profiles";

export const SPECTRUM_HUES = ["magenta", "violet", "blue", "cyan", "mint"] as const;
export type SpectrumHue = (typeof SPECTRUM_HUES)[number];

/** One hue per AI model — the same spectrum stops used in the mark and palette. */
export function platformHue(platform: string): SpectrumHue {
  switch (platform) {
    case "perplexity":
      return "magenta";
    case "anthropic":
      return "violet";
    case "gemini":
      return "blue";
    case "openai":
      return "cyan";
    default:
      return "mint"; // openai_compatible / deepseek / other
  }
}

export type MetricTone = "good" | "warn" | "bad" | "neutral";

export function toneForScore(value: number | null): MetricTone {
  if (value === null) return "neutral";
  if (value >= 0.66) return "good";
  if (value >= 0.4) return "warn";
  return "bad";
}

function metricValue(key: EntityMetricKey, bundle: CipMetricBundle): number | null {
  const m = bundle.metrics;
  const e = bundle.entityMetrics;
  switch (key) {
    case "recognition":
      return m.mentionRate;
    case "recommendationShare":
      return m.recommendationShare;
    case "citationRate":
      return m.citationRate;
    case "semanticCoverage":
      return m.semanticCoverage;
    case "authority":
      return e.authority;
    case "accuracy":
      return e.accuracyScore;
    case "featureAccuracy":
      return e.featureAccuracy;
    case "competitorDelta":
      return m.competitorDelta;
    default:
      return null;
  }
}

export type FocusMetric = {
  key: EntityMetricKey;
  label: string;
  /** Raw 0..1 (or signed for competitorDelta), null when no evidence. */
  value: number | null;
  /** Display percent, 0..100 (signed for competitorDelta), null when no evidence. */
  percent: number | null;
  tone: MetricTone;
  /** competitorDelta is a signed gap, not a 0..1 score. */
  isDelta: boolean;
};

export type ModelDatum = {
  label: string;
  hue: SpectrumHue;
  /** Composite visibility 0..100 (mention/recommendation/citation mean). */
  visibility: number;
  samples: number;
};

export type CognitionFocus = {
  /** The single metric that leads for this entity type. */
  primary: FocusMetric | null;
  /** The rest of the type's priority metrics, demoted. */
  supporting: FocusMetric[];
  /** Lowest-scoring priority metric — the biggest gap to close. */
  biggestGap: FocusMetric | null;
  /** Type-specific worst-case, always worth stating. */
  topRisk: string;
  /** Per-model visibility, spectrum-coded, strongest first. */
  models: ModelDatum[];
};

export function buildCognitionFocus(input: {
  entityType: string | null | undefined;
  bundle: CipMetricBundle;
  locale: Locale;
}): CognitionFocus {
  const profile = getEntityProfile(input.entityType);
  const hasEvidence = input.bundle.sampleCount > 0;

  const metrics: FocusMetric[] = profile.primaryMetrics.map((key) => {
    const raw = hasEvidence ? metricValue(key, input.bundle) : null;
    const isDelta = key === "competitorDelta";
    const percent =
      raw === null ? null : isDelta ? Math.round(raw * 100) : Math.round(Math.max(0, Math.min(1, raw)) * 100);
    const tone: MetricTone =
      raw === null ? "neutral" : isDelta ? (raw >= 0 ? "good" : "bad") : toneForScore(raw);
    return { key, label: getEntityMetricLabel(key, input.locale), value: raw, percent, tone, isDelta };
  });

  const primary = metrics[0] ?? null;
  const supporting = metrics.slice(1);
  const gapCandidates = metrics
    .filter((metric) => !metric.isDelta && metric.value !== null)
    .sort((a, b) => (a.value as number) - (b.value as number));
  const biggestGap = gapCandidates[0] ?? null;

  const models: ModelDatum[] = (input.bundle.modelBreakdown ?? [])
    .filter((model) => model.sampleCount > 0)
    .map((model) => ({
      label: model.providerName || model.model || model.platform,
      hue: platformHue(model.platform),
      visibility: Math.round(((model.mentionRate + model.recommendationShare + model.citationRate) / 3) * 100),
      samples: model.sampleCount,
    }))
    .sort((a, b) => b.visibility - a.visibility);

  return { primary, supporting, biggestGap, topRisk: profile.topRisk[input.locale], models };
}

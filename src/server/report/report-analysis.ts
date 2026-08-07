/**
 * Report analysis — the deterministic skeleton behind the "deep analysis"
 * report. It turns the raw bundle + nebula + proof data into an interpreted
 * read per primary metric: the number in context, what's driving it, the
 * causal evidence, and the projected impact of acting. An AI layer later
 * polishes these into prose; this module is the source of truth and the
 * fallback, so it is pure, deterministic, and unit-tested.
 */
import type { Locale } from "@/i18n/config";
import type { CipMetricBundle } from "@/server/metrics/cip-metrics";
import { buildCognitionFocus, type FocusMetric, type MetricTone } from "@/server/dashboard/cognition-focus";
import { getEntityProfile } from "@/server/entity/entity-profiles";
import { asRecord, numberOrNull, stringOrEmpty } from "@/server/utils/coerce";

export type MetricAnalysis = {
  key: FocusMetric["key"];
  label: string;
  percent: number | null;
  tone: MetricTone;
  /** The number placed in context (healthy band + weakest model). */
  context: string;
  /** What is pulling the metric down — grounded in nebula + per-model gaps. */
  drivers: string[];
  /** Causal evidence, when the proof layer has any. */
  causal: string | null;
  /** Projected impact of the recommended action. */
  impact: string | null;
};

export type ReportAnalysis = {
  headline: string;
  verdict: string;
  metrics: MetricAnalysis[];
};

type ExperimentSummary = { name?: string; significant?: boolean; netEffect?: number; pValue?: number };

const HEALTHY = 0.66;
const WEAK = 0.4;

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

/** For a given metric key, the weakest model and its score for that metric. */
function weakestModel(key: FocusMetric["key"], bundle: CipMetricBundle): { label: string; percent: number } | null {
  const field =
    key === "citationRate"
      ? "citationRate"
      : key === "recommendationShare"
        ? "recommendationShare"
        : key === "recognition"
          ? "mentionRate"
          : null;
  if (!field) return null;
  const rows = (bundle.modelBreakdown ?? []).filter((m) => m.sampleCount > 0);
  if (rows.length === 0) return null;
  const worst = rows.reduce((a, b) => ((a[field] as number) <= (b[field] as number) ? a : b));
  return { label: worst.providerName || worst.model || worst.platform, percent: pct(worst[field] as number) };
}

export function buildReportAnalysis(input: {
  entityType: string | null | undefined;
  subjectName: string;
  bundle: CipMetricBundle;
  nebulaSummary: Record<string, unknown>;
  correlation: Record<string, unknown> | null;
  experiments: ExperimentSummary[];
  locale: Locale;
}): ReportAnalysis {
  const zh = input.locale === "zh-CN";
  const profile = getEntityProfile(input.entityType);
  const focus = buildCognitionFocus({ entityType: input.entityType, bundle: input.bundle, locale: input.locale });

  const riskTerms = asStringList(input.nebulaSummary.strongestNegativeTerms)
    .concat(asStringList(input.nebulaSummary.riskTerms))
    .slice(0, 2);
  const competitorTerms = asStringList(input.nebulaSummary.competitorOwnedTerms).slice(0, 2);

  const sig = input.experiments.find((e) => e.significant);
  const corr = input.correlation ? numberOrNull(asRecord(input.correlation).bestLagCorrelation ?? asRecord(input.correlation).sameDayCorrelation) : null;
  const corrSource = input.correlation ? stringOrEmpty(asRecord(input.correlation).sourceName) : "";

  const allMetrics = [focus.primary, ...focus.supporting].filter((m): m is FocusMetric => m !== null);

  const metrics: MetricAnalysis[] = allMetrics.map((metric, index) => {
    const band =
      metric.tone === "good" ? (zh ? "处于健康区间" : "in the healthy band")
      : metric.tone === "warn" ? (zh ? "低于健康区间" : "below the healthy band")
      : metric.tone === "bad" ? (zh ? "严重偏低" : "critically low")
      : (zh ? "暂无足够证据" : "not enough evidence yet");
    const weak = weakestModel(metric.key, input.bundle);
    const context = metric.isDelta
      ? metric.percent === null
        ? band
        : metric.percent >= 0
          ? (zh ? `领先竞品 ${metric.percent} 个点。` : `${metric.percent} points ahead of competitors.`)
          : (zh ? `落后竞品 ${Math.abs(metric.percent)} 个点。` : `${Math.abs(metric.percent)} points behind competitors.`)
      : metric.percent === null
        ? band
        : weak
          ? (zh
              ? `${metric.percent}%，${band}；最弱的是 ${weak.label}（${weak.percent}%）。`
              : `${metric.percent}% — ${band}; weakest on ${weak.label} (${weak.percent}%).`)
          : (zh ? `${metric.percent}%，${band}。` : `${metric.percent}% — ${band}.`);

    const drivers: string[] = [];
    if (metric.tone === "bad" || metric.tone === "warn") {
      if (competitorTerms.length > 0) {
        drivers.push(zh ? `对比话题被 ${competitorTerms.join("、")} 占据。` : `Comparison topics are owned by ${competitorTerms.join(", ")}.`);
      }
      if (riskTerms.length > 0) {
        drivers.push(zh ? `AI 把你与「${riskTerms.join("、")}」关联，稀释了信号。` : `AI associates you with "${riskTerms.join(", ")}", diluting the signal.`);
      }
      if (weak && weak.percent < WEAK * 100) {
        drivers.push(zh ? `${weak.label} 上几乎不出现（${weak.percent}%）。` : `Almost absent on ${weak.label} (${weak.percent}%).`);
      }
    }
    if (drivers.length === 0) {
      drivers.push(zh ? "各模型表现均衡，无明显拖累项。" : "Even across models — no single drag.");
    }

    const causal =
      index === 0 && sig
        ? (zh
            ? `已验证：${sig.name ?? "一项实验"}扣除模型漂移后净提升 ${Math.round((sig.netEffect ?? 0) * 100)} 个点（p=${(sig.pValue ?? 0).toFixed(2)}）——是干预而非漂移。`
            : `Proven: ${sig.name ?? "an experiment"} lifted this ${Math.round((sig.netEffect ?? 0) * 100)}pts net of model drift (p=${(sig.pValue ?? 0).toFixed(2)}) — intervention, not drift.`)
        : index === 0 && corr !== null && Math.abs(corr) >= 0.5
          ? (zh
              ? `AI 可见度与${corrSource || "业务结果"}相关（r=${corr.toFixed(2)}）——它不是虚荣指标。`
              : `AI visibility tracks ${corrSource || "the business outcome"} (r=${corr.toFixed(2)}) — not a vanity metric.`)
          : null;

    const impact =
      metric.tone === "bad" || metric.tone === "warn"
        ? (zh
            ? `补上 ${weak?.label ?? "最弱模型"} 的差距，是这一项最快的杠杆。`
            : `Closing the ${weak?.label ?? "weakest-model"} gap is the fastest lever here.`)
        : null;

    return { key: metric.key, label: metric.label, percent: metric.percent, tone: metric.tone, context, drivers, causal, impact };
  });

  const lead = focus.primary;
  const verdict = profile.verdictLead[input.locale].replace("{subject}", input.subjectName);
  const headline =
    lead && lead.percent !== null
      ? zh
        ? `${lead.label}为 ${lead.percent}${lead.isDelta ? " 个点" : "%"}，是当前最该盯的指标。`
        : `${lead.label} sits at ${lead.percent}${lead.isDelta ? "pts" : "%"} — the metric to watch.`
      : zh
        ? "证据尚不足以给出判定，先完成一次完整审计。"
        : "Not enough evidence for a verdict yet — run a full audit first.";

  return { headline, verdict, metrics };
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => stringOrEmpty(v)).filter(Boolean) : [];
}

/**
 * Cognition-over-time — turns the snapshot stream into monitoring.
 *
 *  - visibility / mention / recommendation / citation trend (daily series)
 *  - metric drift signals (recent vs prior window, beyond noise)
 *  - term drift: which associations AI newly formed, dropped, or shifted
 *    between the two most recent nebula snapshots.
 */
import type { Locale } from "@/i18n/config";
import { getPrisma } from "@/server/db";
import { mean } from "@/server/analysis/causal-statistics";

type MetricKey = "visibility" | "mention" | "recommendation" | "citation";

export type TrendPoint = { date: string; visibility: number; mention: number; recommendation: number; citation: number };

export type MetricDelta = {
  key: MetricKey;
  first: number;
  last: number;
  delta: number; // in points (0..100)
  direction: "up" | "down" | "flat";
  notable: boolean;
};

export type DriftSignal = {
  id: string;
  kind: "metric" | "term_emerged" | "term_faded" | "term_shift";
  severity: "positive" | "watch" | "negative";
  message: string;
};

export type CognitionTrend = {
  hasData: boolean;
  days: number;
  series: TrendPoint[];
  metrics: MetricDelta[];
  signals: DriftSignal[];
};

const NOTABLE_PTS = 5; // a >=5pt move is worth surfacing
const TERM_SHIFT_PTS = 12;

export async function getCognitionTrend(input: { projectId: string; subjectId?: string | null; locale: Locale }): Promise<CognitionTrend> {
  const prisma = getPrisma();
  const [snapshots, nebulas] = await Promise.all([
    prisma.metricSnapshot.findMany({
      where: { projectId: input.projectId, aiVisibilityScore: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { aiVisibilityScore: true, mentionRate: true, recommendationShare: true, citationRate: true, createdAt: true },
    }),
    prisma.semanticNebulaSnapshot.findMany({
      where: { projectId: input.projectId, ...(input.subjectId ? { subjectId: input.subjectId } : {}), scope: "OVERALL" },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { nodeJson: true, createdAt: true },
    }),
  ]);

  // Collapse to one point per day (last snapshot of each day wins).
  const byDay = new Map<string, TrendPoint>();
  for (const s of snapshots) {
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay.set(day, {
      date: day,
      visibility: pct(s.aiVisibilityScore ?? 0),
      mention: pct(s.mentionRate),
      recommendation: pct(s.recommendationShare),
      citation: pct(s.citationRate),
    });
  }
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (series.length < 2) {
    return { hasData: false, days: series.length, series, metrics: [], signals: [] };
  }

  const metricDefs: Array<{ key: MetricKey; pick: (p: TrendPoint) => number }> = [
    { key: "visibility", pick: (p) => p.visibility },
    { key: "mention", pick: (p) => p.mention },
    { key: "recommendation", pick: (p) => p.recommendation },
    { key: "citation", pick: (p) => p.citation },
  ];

  const labels = metricLabels(input.locale);
  const metrics: MetricDelta[] = metricDefs.map(({ key, pick }) => {
    const values = series.map(pick);
    const first = values[0];
    const last = values[values.length - 1];
    const delta = Math.round(last - first);
    const sd = stddev(values);
    const notable = Math.abs(delta) >= Math.max(NOTABLE_PTS, sd * 1.2);
    return { key, first, last, delta, direction: delta > 1 ? "up" : delta < -1 ? "down" : "flat", notable };
  });

  const signals: DriftSignal[] = [];
  // The four metric deltas already render as chips, so surface only the single
  // most-moved metric as a written signal — term drift is the more telling story.
  const notableMetrics = metrics
    .filter((m) => m.notable)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 1);
  for (const m of notableMetrics) {
    signals.push({
      id: `metric-${m.key}`,
      kind: "metric",
      severity: m.delta > 0 ? "positive" : "negative",
      message: formatMetricSignal(input.locale, labels[m.key], m.delta, series.length),
    });
  }

  // Term drift between the two latest nebula snapshots.
  if (nebulas.length === 2) {
    const latest = termMap(nebulas[0].nodeJson);
    const prev = termMap(nebulas[1].nodeJson);
    const emerged = [...latest.entries()].filter(([t]) => !prev.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const faded = [...prev.entries()].filter(([t]) => !latest.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const shifted = [...latest.entries()]
      .filter(([t]) => prev.has(t) && Math.abs(latest.get(t)! - prev.get(t)!) >= TERM_SHIFT_PTS)
      .map(([t]) => ({ term: t, delta: Math.round(latest.get(t)! - prev.get(t)!) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    for (const [term] of emerged) {
      signals.push({ id: `emerged-${term}`, kind: "term_emerged", severity: "positive", message: termSignal(input.locale, "emerged", term) });
    }
    for (const [term] of faded) {
      signals.push({ id: `faded-${term}`, kind: "term_faded", severity: "watch", message: termSignal(input.locale, "faded", term) });
    }
    for (const s of shifted) {
      signals.push({
        id: `shift-${s.term}`,
        kind: "term_shift",
        severity: s.delta > 0 ? "positive" : "watch",
        message: termShiftSignal(input.locale, s.term, s.delta),
      });
    }
  }

  return { hasData: true, days: series.length, series, metrics, signals };
}

function termMap(value: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (!Array.isArray(value)) return map;
  for (const node of value) {
    const r = node as Record<string, unknown>;
    const term = typeof r.term === "string" ? r.term : "";
    const gravity = typeof r.semanticGravity === "number" ? r.semanticGravity : 0;
    if (term) map.set(term, gravity);
  }
  return map;
}

function metricLabels(locale: Locale): Record<MetricKey, string> {
  return locale === "zh-CN"
    ? { visibility: "AI 可见度", mention: "提及率", recommendation: "推荐占比", citation: "引用率" }
    : { visibility: "AI visibility", mention: "Mention rate", recommendation: "Recommendation share", citation: "Citation rate" };
}

function formatMetricSignal(locale: Locale, label: string, delta: number, days: number): string {
  const sign = delta > 0 ? "+" : "";
  return locale === "zh-CN"
    ? `${label}在过去 ${days} 天${delta > 0 ? "上升" : "下降"} ${Math.abs(delta)} 个点（${sign}${delta}pts）。`
    : `${label} ${delta > 0 ? "rose" : "fell"} ${Math.abs(delta)}pts over the last ${days} days (${sign}${delta}pts).`;
}

function termSignal(locale: Locale, kind: "emerged" | "faded", term: string): string {
  if (locale === "zh-CN") {
    return kind === "emerged" ? `AI 开始把你和「${term}」关联起来。` : `AI 不再稳定把你和「${term}」关联。`;
  }
  return kind === "emerged" ? `AI started associating you with "${term}".` : `AI stopped reliably associating you with "${term}".`;
}

function termShiftSignal(locale: Locale, term: string, delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return locale === "zh-CN"
    ? `「${term}」的语义引力变化 ${sign}${delta}。`
    : `Semantic gravity for "${term}" shifted ${sign}${delta}.`;
}

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

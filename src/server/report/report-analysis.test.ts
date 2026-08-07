import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReportAnalysis } from "@/server/report/report-analysis";
import type { CipMetricBundle } from "@/server/metrics/cip-metrics";

function bundle(over: Partial<CipMetricBundle["metrics"]> = {}): CipMetricBundle {
  return {
    runId: "r1", sampleCount: 24,
    metrics: {
      aiVisibilityScore: 0.6, citationRate: 0.47, mentionRate: 0.58, recommendationShare: 0.34,
      aiImpressionShare: 0.5, entityVisibility: 0.5, semanticCoverage: 0.73, stabilityIndex: 0.69,
      hallucinationRiskScore: 0.1, competitorDelta: -0.08, ...over,
    },
    entityMetrics: { factualAccuracy: 0.7, featureAccuracy: 0.6, authority: 0.4, identityConfusionRisk: 0.2, parameterErrorRate: 0.1, accuracyScore: 0.65 },
    modelBreakdown: [
      { modelKey: "a", providerId: null, providerName: "GPT", modelId: null, model: "gpt", platform: "openai", sampleCount: 6, mentionRate: 0.7, recommendationShare: 0.5, citationRate: 0.6, accuracyScore: 0.7 },
      { modelKey: "b", providerId: null, providerName: "Perplexity", modelId: null, model: "sonar", platform: "perplexity", sampleCount: 6, mentionRate: 0.3, recommendationShare: 0.18, citationRate: 0.25, accuracyScore: 0.5 },
    ],
    confidence: {},
  };
}

const nebula = { competitorOwnedTerms: ["Datadog", "Arize"], strongestNegativeTerms: ["pricing unclear"] };

test("headline + verdict lead with the primary metric and subject", () => {
  const a = buildReportAnalysis({ entityType: "BRAND", subjectName: "Observable AI", bundle: bundle(), nebulaSummary: nebula, correlation: null, experiments: [], locale: "en" });
  assert.match(a.headline, /Recommendation share/i);
  assert.match(a.verdict, /Observable AI/);
  assert.equal(a.metrics[0].key, "recommendationShare");
});

test("context names the weakest model for the metric", () => {
  const a = buildReportAnalysis({ entityType: "BRAND", subjectName: "X", bundle: bundle(), nebulaSummary: nebula, correlation: null, experiments: [], locale: "en" });
  const primary = a.metrics[0];
  assert.match(primary.context, /critically low/); // 34% recommendation share
  assert.match(primary.context, /Perplexity/); // weakest on recommendationShare
});

test("drivers pull from competitor-owned + risk terms when the metric is weak", () => {
  const a = buildReportAnalysis({ entityType: "BRAND", subjectName: "X", bundle: bundle(), nebulaSummary: nebula, correlation: null, experiments: [], locale: "en" });
  const drivers = a.metrics[0].drivers.join(" ");
  assert.match(drivers, /Datadog/);
  assert.match(drivers, /pricing unclear/);
});

test("a significant experiment becomes the causal read on the lead metric", () => {
  const a = buildReportAnalysis({
    entityType: "BRAND", subjectName: "X", bundle: bundle(), nebulaSummary: nebula, correlation: null,
    experiments: [{ name: "Homepage rewrite", significant: true, netEffect: 0.25, pValue: 0.02 }], locale: "en",
  });
  assert.match(a.metrics[0].causal ?? "", /Proven.*25pts.*p=0\.02/);
});

test("without an experiment, a strong correlation carries the causal read", () => {
  const a = buildReportAnalysis({
    entityType: "BRAND", subjectName: "X", bundle: bundle(), nebulaSummary: nebula,
    correlation: { bestLagCorrelation: 0.82, sourceName: "signups" }, experiments: [], locale: "en",
  });
  assert.match(a.metrics[0].causal ?? "", /tracks signups.*r=0\.82/);
});

test("competitorDelta reads as a signed gap, not a percent", () => {
  const a = buildReportAnalysis({ entityType: "BRAND", subjectName: "X", bundle: bundle({ competitorDelta: -0.08 }), nebulaSummary: nebula, correlation: null, experiments: [], locale: "en" });
  const delta = a.metrics.find((m) => m.key === "competitorDelta");
  assert.match(delta?.context ?? "", /8 points behind competitors/);
});

test("zh locale produces Chinese analysis", () => {
  const a = buildReportAnalysis({ entityType: "BRAND", subjectName: "可观测", bundle: bundle(), nebulaSummary: nebula, correlation: null, experiments: [], locale: "zh-CN" });
  assert.match(a.headline, /最该盯的指标/);
  assert.match(a.metrics[0].context, /严重偏低/); // 34% 推荐占比
});

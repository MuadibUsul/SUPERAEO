import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCognitionFocus, platformHue, toneForScore } from "@/server/dashboard/cognition-focus";
import type { CipMetricBundle } from "@/server/metrics/cip-metrics";

function bundle(over: Partial<CipMetricBundle["metrics"]> = {}, sampleCount = 24): CipMetricBundle {
  return {
    runId: "r1",
    sampleCount,
    metrics: {
      aiVisibilityScore: 0.6, citationRate: 0.47, mentionRate: 0.58, recommendationShare: 0.34,
      aiImpressionShare: 0.5, entityVisibility: 0.5, semanticCoverage: 0.73, stabilityIndex: 0.69,
      hallucinationRiskScore: 0.1, competitorDelta: -0.08, ...over,
    },
    entityMetrics: { factualAccuracy: 0.7, featureAccuracy: 0.6, authority: 0.4, identityConfusionRisk: 0.2, parameterErrorRate: 0.1, accuracyScore: 0.65 },
    modelBreakdown: [
      { modelKey: "a", providerId: null, providerName: "GPT", modelId: null, model: "gpt", platform: "openai", sampleCount: 6, mentionRate: 0.7, recommendationShare: 0.5, citationRate: 0.6, accuracyScore: 0.7 },
      { modelKey: "b", providerId: null, providerName: "Claude", modelId: null, model: "claude", platform: "anthropic", sampleCount: 6, mentionRate: 0.5, recommendationShare: 0.3, citationRate: 0.4, accuracyScore: 0.6 },
      { modelKey: "c", providerId: null, providerName: "Idle", modelId: null, model: "x", platform: "gemini", sampleCount: 0, mentionRate: 0, recommendationShare: 0, citationRate: 0, accuracyScore: 0 },
    ],
    confidence: {},
  };
}

test("BRAND leads with recommendationShare and demotes the rest", () => {
  const f = buildCognitionFocus({ entityType: "BRAND", bundle: bundle(), locale: "en" });
  assert.equal(f.primary?.key, "recommendationShare");
  assert.equal(f.primary?.percent, 34);
  assert.equal(f.supporting.length, 2); // recognition, competitorDelta
  assert.ok(f.topRisk.length > 0);
});

test("WEBSITE leads with citationRate (type-specific priority)", () => {
  const f = buildCognitionFocus({ entityType: "WEBSITE", bundle: bundle(), locale: "en" });
  assert.equal(f.primary?.key, "citationRate");
});

test("biggest gap is the lowest non-delta priority metric", () => {
  // BRAND priorities: recommendationShare .34, recognition(mentionRate) .58, competitorDelta(skipped)
  const f = buildCognitionFocus({ entityType: "BRAND", bundle: bundle(), locale: "en" });
  assert.equal(f.biggestGap?.key, "recommendationShare");
});

test("competitorDelta is treated as a signed gap, not a 0..1 score", () => {
  const f = buildCognitionFocus({ entityType: "BRAND", bundle: bundle({ competitorDelta: -0.08 }), locale: "en" });
  const delta = f.supporting.find((m) => m.key === "competitorDelta");
  assert.equal(delta?.isDelta, true);
  assert.equal(delta?.tone, "bad"); // negative delta = behind competitors
  assert.equal(delta?.percent, -8);
});

test("models are spectrum-coded, drop zero-sample models, and sort by visibility", () => {
  const f = buildCognitionFocus({ entityType: "BRAND", bundle: bundle(), locale: "en" });
  assert.equal(f.models.length, 2); // the 0-sample gemini row is dropped
  assert.equal(f.models[0].label, "GPT");
  assert.equal(f.models[0].hue, "cyan");
  assert.equal(f.models[1].hue, "violet");
  assert.ok(f.models[0].visibility > f.models[1].visibility);
});

test("no evidence yields null primary and empty models", () => {
  const f = buildCognitionFocus({ entityType: "BRAND", bundle: bundle({}, 0), locale: "en" });
  assert.equal(f.primary?.value, null);
  assert.equal(f.primary?.tone, "neutral");
});

test("platformHue maps each provider family to a distinct spectrum stop", () => {
  assert.equal(platformHue("perplexity"), "magenta");
  assert.equal(platformHue("openai"), "cyan");
  assert.equal(platformHue("something-else"), "mint");
  assert.equal(toneForScore(0.7), "good");
  assert.equal(toneForScore(0.5), "warn");
  assert.equal(toneForScore(0.2), "bad");
});

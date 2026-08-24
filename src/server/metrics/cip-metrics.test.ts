import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateEntityMetrics, blendedVisibility } from "@/server/metrics/cip-metrics";

const fullSignal = {
  mentionRate: 0.6,
  citationRate: 0.4,
  recommendationShare: 0.3,
  entityVisibility: 0.5,
  coverage: 0.7,
  stability: 0.8,
  accuracyScore: 0.65,
  hallucinationRiskScore: 0.1,
  hasAuthoritySignal: true,
  hasCoverageSignal: true,
  hasAccuracySignal: true,
};

test("with every component present, the blend matches the legacy fixed-weight formula", () => {
  const legacy =
    0.22 * fullSignal.mentionRate +
    0.18 * fullSignal.citationRate +
    0.18 * fullSignal.recommendationShare +
    0.14 * fullSignal.entityVisibility +
    0.1 * fullSignal.coverage +
    0.08 * fullSignal.stability +
    0.1 * fullSignal.accuracyScore -
    0.1 * fullSignal.hallucinationRiskScore;
  assert.ok(Math.abs(blendedVisibility(fullSignal) - legacy) < 1e-9);
});

test("a missing component renormalizes rather than counting as zero", () => {
  // Drop accuracy: its 0.10 weight leaves the blend, and the remaining 0.90 of
  // weight is renormalized to 1.0. Since accuracyScore (0.65) sat below the mean
  // of the others, removing it should not drag the score down toward zero.
  const withAccuracy = blendedVisibility(fullSignal);
  const withoutAccuracy = blendedVisibility({ ...fullSignal, hasAccuracySignal: false });
  const draggedToZero = withAccuracy - 0.1 * fullSignal.accuracyScore; // the naive "treat missing as 0"
  assert.ok(withoutAccuracy > draggedToZero, "renormalized blend must beat the treat-as-zero blend");
});

test("aggregateEntityMetrics ignores never-assessed answers instead of inventing 0.5", () => {
  // All answers were unassessed (null). A BRAND with zero accuracy evidence must
  // not surface a fabricated ~0.5 accuracy — the core credibility fix.
  const noSignal = aggregateEntityMetrics([null, null, null], "BRAND", 0);
  assert.equal(noSignal.accuracyScore, 0);
  assert.equal(noSignal.factualAccuracy, 0);

  // One real assessment among nulls drives the score; the nulls do not dilute it.
  const oneReal = aggregateEntityMetrics(
    [null, { factualAccuracy: 0.9, featureAccuracy: 0.9, identityConfusionRisk: 0, parameterErrorRate: 0, confidence: 1 }, null],
    "BRAND",
    0,
  );
  assert.ok(oneReal.factualAccuracy > 0.8);
});

test("WEBSITE accuracy falls back to authority, not to a fabricated content score", () => {
  const websiteNoSignal = aggregateEntityMetrics([null], "WEBSITE", 0.72);
  assert.equal(websiteNoSignal.accuracyScore, 0.72);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  differenceInDifferences,
  laggedCorrelation,
  normalCdf,
  pearson,
  spearman,
  twoProportionZTest,
  twoSidedPValue,
} from "./causal-statistics";

test("pearson is 1 for a perfect positive line and -1 for a perfect negative line", () => {
  assert.equal(Math.round(pearson([1, 2, 3, 4], [2, 4, 6, 8]) * 1000) / 1000, 1);
  assert.equal(Math.round(pearson([1, 2, 3, 4], [8, 6, 4, 2]) * 1000) / 1000, -1);
});

test("pearson returns 0 for zero variance or too few points", () => {
  assert.equal(pearson([5, 5, 5], [1, 2, 3]), 0);
  assert.equal(pearson([1], [1]), 0);
});

test("spearman captures a monotonic but non-linear relationship", () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [1, 4, 9, 16, 25]; // monotonic, non-linear
  assert.equal(spearman(xs, ys), 1);
});

test("laggedCorrelation finds the lag where the outcome best tracks visibility", () => {
  // Non-linear series (linear ones correlate at every lag). Outcome is the
  // visibility series shifted forward by 2 days.
  const visibility = [10, 50, 20, 80, 30, 90, 40, 60];
  const outcome = [0, 0, 10, 50, 20, 80, 30, 90];
  const result = laggedCorrelation(visibility, outcome, 4);
  assert.equal(result.bestLag, 2);
  assert.ok(result.bestCorrelation > 0.99);
});

test("normalCdf and two-sided p-value match known reference points", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(twoSidedPValue(1.96) - 0.05) < 1e-2);
});

test("twoProportionZTest detects a real difference and ignores a tiny one", () => {
  const strong = twoProportionZTest({ successes: 30, samples: 100 }, { successes: 70, samples: 100 });
  assert.ok(strong.significant);
  assert.ok(strong.diff > 0);

  const weak = twoProportionZTest({ successes: 50, samples: 100 }, { successes: 52, samples: 100 });
  assert.equal(weak.significant, false);
});

test("difference-in-differences removes model drift from the treatment lift", () => {
  // Treatment rose 0.40 -> 0.75 (+0.35); control rose 0.40 -> 0.50 (+0.10)
  // because the model drifted for everyone. Net intervention lift = 0.25.
  const result = differenceInDifferences({
    treatmentPre: { successes: 40, samples: 100 },
    treatmentPost: { successes: 75, samples: 100 },
    controlPre: { successes: 40, samples: 100 },
    controlPost: { successes: 50, samples: 100 },
  });
  assert.ok(Math.abs(result.treatmentDelta - 0.35) < 1e-9);
  assert.ok(Math.abs(result.controlDelta - 0.1) < 1e-9);
  assert.ok(Math.abs(result.netLift - 0.25) < 1e-9);
  assert.ok(result.significant);
});

test("difference-in-differences reports NOT significant when all of the lift is drift", () => {
  // Treatment and control moved identically: the intervention did nothing.
  const result = differenceInDifferences({
    treatmentPre: { successes: 40, samples: 120 },
    treatmentPost: { successes: 60, samples: 120 },
    controlPre: { successes: 40, samples: 120 },
    controlPost: { successes: 60, samples: 120 },
  });
  assert.ok(Math.abs(result.netLift) < 1e-9);
  assert.equal(result.significant, false);
});

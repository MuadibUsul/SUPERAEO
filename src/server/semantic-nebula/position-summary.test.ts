import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPositionSummary } from "@/server/semantic-nebula/position-summary";

const rich = {
  totalTerms: 80,
  strongestPositiveTerms: ["AI observability", "LLM monitoring", "eval tooling"],
  strongestNegativeTerms: ["Observable (data-viz)"],
  competitorOwnedTerms: ["Datadog", "Arize"],
  missingTerms: ["trusted benchmark", "agent monitoring"],
  riskTerms: [],
};

test("locates the entity at its strongest owned meaning", () => {
  const p = buildPositionSummary({ subjectName: "Observable AI", nebulaSummary: rich, locale: "en" });
  assert.equal(p.anchor, "AI observability");
  assert.equal(p.nearestRival, "Datadog");
  assert.equal(p.confusion, "Observable (data-viz)");
  assert.equal(p.clarity, "strong");
});

test("headline weaves anchor + confusion + rival (en)", () => {
  const p = buildPositionSummary({ subjectName: "Observable AI", nebulaSummary: rich, locale: "en" });
  assert.match(p.headline, /places Observable AI closest to "AI observability"/);
  assert.match(p.headline, /dangerously near "Observable \(data-viz\)"/);
  assert.match(p.headline, /"Datadog" owns that neighbourhood/);
});

test("headline works in Chinese", () => {
  const p = buildPositionSummary({ subjectName: "可观测", nebulaSummary: rich, locale: "zh-CN" });
  assert.match(p.headline, /最紧地放在「AI observability」/);
  assert.match(p.headline, /危险地贴近「Observable \(data-viz\)」/);
  assert.match(p.headline, /由「Datadog」占据/);
});

test("no evidence => unlocated", () => {
  const p = buildPositionSummary({ subjectName: "X", nebulaSummary: { totalTerms: 0 }, locale: "en" });
  assert.equal(p.clarity, "unlocated");
  assert.equal(p.anchor, null);
  assert.match(p.headline, /hasn't placed X anywhere stable/);
});

test("partial when owned meanings are thin or confusions crowd", () => {
  const p = buildPositionSummary({
    subjectName: "X",
    nebulaSummary: { totalTerms: 20, strongestPositiveTerms: ["thing"], competitorOwnedTerms: [], strongestNegativeTerms: ["a", "b", "c"] },
    locale: "en",
  });
  assert.equal(p.clarity, "partial");
  assert.equal(p.anchor, "thing");
  // no rival, no trailing rival clause
  assert.doesNotMatch(p.headline, /owns that neighbourhood/);
});

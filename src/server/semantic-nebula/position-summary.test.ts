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
  assert.match(p.headline, /most often associates this brand with "AI observability"/);
  assert.match(p.explanation ?? "", /may give users the wrong impression/);
  assert.match(p.explanation ?? "", /"Datadog" stands out more/);
});

test("headline works in Chinese", () => {
  const p = buildPositionSummary({ subjectName: "耳机", entityType: "PRODUCT", nebulaSummary: rich, locale: "zh-CN" });
  assert.match(p.headline, /最常把这款产品和「AI observability」联系在一起/);
  assert.match(p.explanation ?? "", /可能让用户产生错误理解/);
  assert.match(p.explanation ?? "", /「Datadog」出现得更突出/);
});

test("no evidence => unlocated", () => {
  const p = buildPositionSummary({ subjectName: "X", nebulaSummary: { totalTerms: 0 }, locale: "en" });
  assert.equal(p.clarity, "unlocated");
  assert.equal(p.anchor, null);
  assert.match(p.headline, /isn't enough data/);
});

test("partial when owned meanings are thin or confusions crowd", () => {
  const p = buildPositionSummary({
    subjectName: "X",
    nebulaSummary: { totalTerms: 20, strongestPositiveTerms: ["thing"], competitorOwnedTerms: [], strongestNegativeTerms: ["a", "b", "c"] },
    locale: "en",
  });
  assert.equal(p.clarity, "partial");
  assert.equal(p.anchor, "thing");
  assert.doesNotMatch(p.explanation ?? "", /competitive answers/);
});

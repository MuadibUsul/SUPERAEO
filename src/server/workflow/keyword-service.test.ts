import assert from "node:assert/strict";
import test from "node:test";

import { mergeSemanticKeywordsForStorage } from "@/server/workflow/keyword-service";

test("merges duplicate semantic keywords by normalized keyword before database persistence", () => {
  const result = mergeSemanticKeywordsForStorage([
    {
      keyword: "Low Sugar",
      keywordType: "attribute",
      targetWeight: 0.6,
      reason: "Attribute association",
      confidence: 0.7,
    },
    {
      keyword: " low   sugar ",
      keywordType: "risk",
      targetWeight: 0.9,
      reason: "Risk boundary association",
      confidence: 0.8,
    },
    {
      keyword: "office afternoon",
      keywordType: "scenario",
      targetWeight: 0.5,
      reason: "Scenario",
      confidence: 0.6,
    },
  ]);

  assert.equal(result.keywords.length, 2);
  assert.equal(result.keywords[0].keyword.trim().toLowerCase(), "low sugar");
  assert.equal(result.keywords[0].keywordType, "risk");
  assert.equal(result.keywords[0].targetWeight, 0.9);
  assert.equal(result.keywords[0].confidence, 0.8);
  assert.deepEqual(result.duplicateSamples, [" low   sugar "]);
});

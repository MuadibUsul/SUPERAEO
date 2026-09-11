import assert from "node:assert/strict";
import test from "node:test";

import { answerExtractorOutputSchema } from "@/server/ai/prompts/answer-extractor";

test("normalizes common provider shape drift before validating AnswerAnalysis", () => {
  const parsed = answerExtractorOutputSchema.safeParse({
    targetMentioned: true,
    mentionedEntities: [{ name: "Jina AI" }, "Qdrant"],
    recommendationWinner: { name: "Jina AI" },
    sentiment: "POSITIVE",
    risks: [
      "The answer makes an unsupported claim.",
      { description: "A material identity mix-up.", severity: "high" },
    ],
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.targetRecommended, false);
  assert.equal(parsed.data.mentionedEntities[0]?.entityType, null);
  assert.equal(parsed.data.mentionedEntities[1]?.name, "Qdrant");
  assert.equal(parsed.data.recommendationWinner, "Jina AI");
  assert.equal(parsed.data.sentiment, "positive");
  assert.equal(parsed.data.risks[0]?.riskLevel, "P3");
  assert.equal(parsed.data.risks[1]?.riskLevel, "P1");
  assert.equal(parsed.data.entityProfile.authorityScore, 0.5);
  assert.equal(parsed.data.confidence, 0.5);
});

test("still rejects non-object analysis output", () => {
  assert.equal(answerExtractorOutputSchema.safeParse(["not", "an", "analysis"]).success, false);
});

test("keeps well-formed semantic units and drops malformed ones without failing extraction", () => {
  const parsed = answerExtractorOutputSchema.safeParse({
    targetMentioned: true,
    semanticUnits: [
      { domain: "ATTRIBUTE", type: "PROPERTY", canonicalLabel: "fast retrieval", object: "fast retrieval", confidence: 0.7 },
      { domain: "NOT_A_REAL_DOMAIN", type: "PROPERTY", canonicalLabel: "junk" }, // dropped: bad domain
      { type: "PROPERTY", canonicalLabel: "missing domain" }, // dropped: no domain
    ],
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.semanticUnits.length, 1);
  assert.equal(parsed.data.semanticUnits[0]?.canonicalLabel, "fast retrieval");
});

test("semanticUnits defaults to an empty list when absent", () => {
  const parsed = answerExtractorOutputSchema.safeParse({ targetMentioned: false });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data.semanticUnits, []);
});

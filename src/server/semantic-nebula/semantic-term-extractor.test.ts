import assert from "node:assert/strict";
import test from "node:test";

import { extractSemanticTermCandidates } from "@/server/semantic-nebula/semantic-term-extractor";

type Analysis = NonNullable<Parameters<typeof extractSemanticTermCandidates>[0]["responses"][number]["analysis"]>;

function response(id: string, answer: string, analysis: Partial<Analysis>) {
  return {
    id,
    runId: "run-1",
    model: "model-a",
    rawResponse: answer,
    normalizedAnswer: answer,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    query: {
      id: `query-${id}`,
      queryText: "Which tools should I compare?",
      queryType: "comparison",
      persona: "buyer",
      intent: "comparison",
    },
    analysis: {
      brandMentioned: true,
      brandRecommended: false,
      sentiment: "neutral",
      matchedKeywords: [],
      competitorsMentioned: [],
      recommendationWinner: null,
      mentionContext: null,
      brandDescription: null,
      possibleHallucinations: [],
      ...analysis,
    },
  };
}

function extract(responses: ReturnType<typeof response>[]) {
  return extractSemanticTermCandidates({
    subjectName: "CIP",
    competitors: ["Rival AI"],
    desiredTerms: [],
    undesiredTerms: [],
    keywords: [],
    responses,
  });
}

test("one response naming a term through two paths counts as a single competitor sighting", () => {
  // "Rival AI" arrives once as a matched keyword and again in competitorsMentioned.
  // Both are the same answer, so the competitor context must be credited once.
  const candidates = extract([
    response("r1", "Rival AI is the alternative.", {
      matchedKeywords: ["Rival AI"],
      competitorsMentioned: ["Rival AI"],
    }),
  ]);

  const rival = candidates.find((candidate) => candidate.normalizedTerm === "rival ai");
  assert.ok(rival, "expected the competitor to be extracted");
  assert.equal(rival.competitorContextHits, 1);
  assert.equal(rival.occurrences, 1);
  assert.equal(rival.responseIds.size, 1);
});

test("a later extraction path still contributes a context the first path lacked", () => {
  // Regression: the term is first seen without the competitor flag. The counter
  // must still register the competitor context when the flagged path arrives,
  // rather than being suppressed as "already seen this response".
  const candidates = extract([
    response("r1", "Rival AI shows up here.", {
      matchedKeywords: ["Rival AI"],
      competitorsMentioned: ["Rival AI"],
      recommendationWinner: "Rival AI",
    }),
  ]);

  const rival = candidates.find((candidate) => candidate.normalizedTerm === "rival ai");
  assert.ok(rival);
  assert.equal(rival.competitorContextHits, 1);
  assert.equal(rival.recommendationHits, 1);
});

test("distinct responses each add one sighting per context", () => {
  const candidates = extract([
    response("r1", "Rival AI is an option.", { competitorsMentioned: ["Rival AI"] }),
    response("r2", "Rival AI again.", { competitorsMentioned: ["Rival AI"] }),
    response("r3", "Rival AI once more.", { competitorsMentioned: ["Rival AI"] }),
  ]);

  const rival = candidates.find((candidate) => candidate.normalizedTerm === "rival ai");
  assert.ok(rival);
  assert.equal(rival.competitorContextHits, 3);
  assert.equal(rival.occurrences, 3);
  assert.equal(rival.responseIds.size, 3);
});

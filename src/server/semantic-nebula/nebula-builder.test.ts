import assert from "node:assert/strict";
import test from "node:test";

import { buildSemanticNebula } from "@/server/semantic-nebula/nebula-builder";

test("builds nebula nodes and evidence from sampled responses", () => {
  const graph = buildSemanticNebula(
    {
      subject: {
        id: "subject-1",
        entityType: "BRAND",
        displayName: "CIP",
        canonicalName: "cip",
        profileJson: { desiredAssociations: ["evidence-backed"] },
      },
      competitors: [{ name: "Competitor AI" }],
      keywords: [
        { keyword: "AI visibility", keywordType: "category", targetWeight: 0.9 },
        { keyword: "Competitor AI", keywordType: "competitor", targetWeight: 0.5 },
      ],
      responses: [
        {
          id: "response-1",
          runId: "run-1",
          model: "model-a",
          rawResponse: "CIP is useful for AI visibility. Competitor AI is another option.",
          normalizedAnswer: "CIP is useful for AI visibility. Competitor AI is another option.",
          createdAt: new Date("2026-05-19T00:00:00Z"),
          query: {
            id: "query-1",
            queryText: "Which AI visibility tools should I compare?",
            queryType: "comparison",
            persona: "buyer",
            intent: "AI visibility comparison",
          },
          analysis: {
            brandMentioned: true,
            brandRecommended: false,
            sentiment: "positive",
            matchedKeywords: ["AI visibility"],
            competitorsMentioned: ["Competitor AI"],
            recommendationWinner: null,
            mentionContext: "CIP is useful for AI visibility.",
            brandDescription: null,
            possibleHallucinations: [],
          },
        },
      ],
    },
    "OVERALL",
  );

  assert.ok(graph.nodes.some((node) => node.term === "AI visibility"));
  assert.ok(graph.edges.length > 0);
  assert.equal(graph.summary.subjectName, "CIP");
});

test("retains more than eighty scored nodes when evidence supports it", () => {
  const responses = Array.from({ length: 180 }, (_, index) => ({
    id: `response-${index}`,
    runId: "run-1",
    model: "model-a",
    rawResponse: `CIP is associated with semantic term ${index}.`,
    normalizedAnswer: `CIP is associated with semantic term ${index}.`,
    createdAt: new Date("2026-05-19T00:00:00Z"),
    query: {
      id: `query-${index}`,
      queryText: `Question ${index}`,
      queryType: "scenario_recommendation",
      persona: `persona-${index % 5}`,
      intent: `intent-${index % 12}`,
    },
    analysis: {
      brandMentioned: true,
      brandRecommended: index % 3 === 0,
      sentiment: "positive",
      matchedKeywords: [`semantic term ${index}`],
      competitorsMentioned: [],
      recommendationWinner: null,
      mentionContext: `CIP is associated with semantic term ${index}.`,
      brandDescription: null,
      possibleHallucinations: [],
    },
  }));

  const graph = buildSemanticNebula(
    {
      subject: {
        id: "subject-1",
        entityType: "BRAND",
        displayName: "CIP",
        canonicalName: "cip",
        profileJson: null,
      },
      competitors: [],
      keywords: Array.from({ length: 180 }, (_, index) => ({
        keyword: `semantic term ${index}`,
        keywordType: "category",
        targetWeight: 0.9,
      })),
      responses,
    },
    "OVERALL",
  );

  assert.ok(graph.nodes.length > 80);
  assert.ok(graph.nodes.length <= 140);
});

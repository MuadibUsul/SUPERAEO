import assert from "node:assert/strict";
import test from "node:test";

import { buildSemanticNebula } from "@/server/semantic-nebula/nebula-builder";
import { extractConstrainedAnswerTerms } from "@/server/semantic-nebula/semantic-term-extractor";

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
  assert.notEqual(graph.nodes.find((node) => node.term === "AI visibility")?.termType, "COMPETITOR");
  assert.equal(graph.nodes.find((node) => node.term === "Competitor AI")?.termType, "COMPETITOR");
  assert.deepEqual(graph.nodes.find((node) => node.term === "AI visibility")?.models, ["model-a"]);
  assert.ok(graph.edges.length > 0);
  assert.equal(graph.summary.subjectName, "CIP");
});

test("extracts only bounded semantic phrases instead of fixed-width answer chunks", () => {
  const answer = [
    "Profound is the best-known option, while another platform is recommended for teams that want transparent methodology and raw response storage.",
    "- **Sound quality:** balanced and clear",
    "- **Quick charging:** useful for travel",
    "## Noise cancellation",
    "**This is an entire explanatory sentence that should not become a semantic term because it is too long and contains punctuation.**",
  ].join("\n");

  const terms = extractConstrainedAnswerTerms(answer, "Sony WH-CH720N", ["Profound"]);

  assert.deepEqual(terms.sort(), ["Noise cancellation", "Quick charging", "Sound quality"].sort());
  assert.equal(terms.some((term) => term.includes("response sto") || term === "rage"), false);
});

test("cleans model keywords and does not turn the subject into its own semantic node", () => {
  const graph = buildSemanticNebula(
    {
      subject: {
        id: "subject-1",
        entityType: "BRAND",
        displayName: "元气森林",
        canonicalName: "元气森林",
        profileJson: null,
      },
      competitors: [],
      keywords: [],
      responses: [
        {
          id: "response-1",
          runId: "run-1",
          model: "model-a",
          rawResponse: "元气森林主打清爽口感，也常被放在平价品牌里讨论。",
          createdAt: new Date("2026-08-14T00:00:00Z"),
          query: { id: "query-1", queryText: "如何评价？", queryType: "comparison" },
          analysis: {
            brandMentioned: true,
            brandRecommended: false,
            sentiment: "neutral",
            matchedKeywords: ["主打0糖0卡，用的是赤藓糖醇", "平价品牌（如盒马、山姆自营）", "清爽口感"],
            competitorsMentioned: [],
            rawAnalysis: { mentionedEntities: [{ name: "元气森林", role: "unknown" }] },
          },
        },
      ],
    },
    "OVERALL",
  );

  assert.equal(graph.nodes.some((node) => node.term === "元气森林"), false);
  assert.equal(graph.nodes.some((node) => node.term.includes("用的是")), false);
  assert.ok(graph.nodes.some((node) => node.term === "平价品牌"));
  assert.ok(graph.nodes.some((node) => node.term === "清爽口感"));
});

test("retains every scored node when evidence supports it", () => {
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

  assert.ok(graph.nodes.length >= 180);
  assert.equal(graph.summary.nodePolicy, "all_clusters");
});

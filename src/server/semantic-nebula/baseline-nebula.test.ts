import assert from "node:assert/strict";
import { test } from "node:test";

import { clusterBaselineUnits, semanticUnitsFromResponses, type BaselineUnitResponse } from "@/server/semantic-nebula/baseline-nebula";

function unit(label: string) {
  return { domain: "ATTRIBUTE", type: "PROPERTY", canonicalLabel: label, object: label, predicate: "HAS_PROPERTY", confidence: 0.6 };
}

function response(id: string, normalizedJson: unknown): BaselineUnitResponse {
  return { id, runId: "run1", providerId: "p1", model: "gpt", normalizedJson };
}

test("builds semantic units from structured answer-extraction output", () => {
  const units = semanticUnitsFromResponses({
    projectId: "proj",
    subjectId: "subj",
    responses: [
      response("r1", { semanticUnits: [unit("fast retrieval"), unit("open source")], confidence: 0.8 }),
      response("r2", { semanticUnits: [unit("fast retrieval")], confidence: 0.7 }),
    ],
  });

  assert.equal(units.length, 3); // 2 from r1 + 1 from r2
  assert.ok(units.every((u) => Boolean(u.source.responseId)), "every unit carries its response id");
  assert.ok(units.every((u) => u.canonicalLabel.length > 0));
});

test("skips answers that carried no units, keywords, or competitors", () => {
  const units = semanticUnitsFromResponses({
    projectId: "proj",
    subjectId: "subj",
    responses: [response("empty", { semanticUnits: [], matchedKeywords: [], mentionedEntities: [] })],
  });
  assert.equal(units.length, 0);
});

test("falls back to keyword units when no structured units are present", () => {
  const units = semanticUnitsFromResponses({
    projectId: "proj",
    subjectId: "subj",
    responses: [response("kw", { semanticUnits: [], matchedKeywords: ["vector database"], confidence: 0.5 })],
  });
  assert.ok(units.length >= 1);
  assert.ok(units.some((u) => u.canonicalLabel.includes("vector")));
});

test("clusters the same concept seen across answers into one node", () => {
  const units = semanticUnitsFromResponses({
    projectId: "proj",
    subjectId: "subj",
    responses: [
      response("r1", { semanticUnits: [unit("fast retrieval"), unit("open source")] }),
      response("r2", { semanticUnits: [unit("fast retrieval")] }),
    ],
  });
  const clusters = clusterBaselineUnits(units);

  assert.equal(clusters.length, 2); // "fast retrieval" (x2) collapses to one cluster + "open source"
  const largest = clusters.reduce((a, b) => (a.memberCount >= b.memberCount ? a : b));
  assert.ok(largest.memberCount >= 2, "the repeated concept aggregates its occurrences");
});

test("a markdown heading is not a unit unless the model emitted it as one", () => {
  // The regex scraper used to turn "**产品特点**" headings into nodes. The
  // structured path only sees what the model classified as a unit, so a heading
  // that was never emitted simply never appears.
  const units = semanticUnitsFromResponses({
    projectId: "proj",
    subjectId: "subj",
    responses: [response("r1", { semanticUnits: [unit("低延迟检索")], matchedKeywords: [] })],
  });
  assert.equal(units.length, 1);
  assert.ok(units[0].canonicalLabel.includes("低延迟检索"));
});

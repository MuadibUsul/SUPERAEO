import assert from "node:assert/strict";
import { test } from "node:test";
import { diffNebulaNodes, diffSummaries, MOVE_THRESHOLD } from "@/components/semantic-intelligence/nebula-diff";
import type { UniverseNode } from "@/components/semantic-intelligence/universe-adapter";

function node(label: string, affinity: number, extra: Partial<UniverseNode> = {}): UniverseNode {
  return {
    evidenceKey: `id-${Math.random()}`, // deliberately unstable, like a per-snapshot DB id
    label,
    type: "attribute",
    strength: affinity,
    freq: 0.5,
    affinity,
    confidence: 0.5,
    domain: "ATTRIBUTE",
    semanticType: "FEATURE",
    x: 0, y: 0, z: 0, rawX: 0, rawY: 0, rawZ: 0,
    examples: [],
    ...extra,
  };
}

test("nodes are matched across snapshots by label, not the per-snapshot evidenceKey", () => {
  const prev = [node("Tesla", 0.5)];
  const curr = [node("tesla", 0.8)]; // different key + case, same term
  const diff = diffNebulaNodes(prev, curr);
  assert.equal(diff.appeared.length, 0, "same term must not read as newly appeared");
  assert.equal(diff.rose.length, 1);
  assert.ok(Math.abs(diff.rose[0].delta - 0.3) < 1e-9);
});

test("classifies appeared / disappeared / rose / fell and ignores noise", () => {
  const prev = [node("gone", 0.6), node("steady", 0.5), node("faller", 0.7)];
  const curr = [node("fresh", 0.4), node("steady", 0.5 + MOVE_THRESHOLD / 2), node("faller", 0.4)];
  const diff = diffNebulaNodes(prev, curr);
  assert.deepEqual(diff.appeared.map((d) => d.label), ["fresh"]);
  assert.deepEqual(diff.disappeared.map((d) => d.label), ["gone"]);
  assert.deepEqual(diff.fell.map((d) => d.label), ["faller"]);
  assert.equal(diff.rose.length, 0);
  assert.equal(diff.counts.stable, 1, "a sub-threshold move stays stable");
});

test("movers are ranked by magnitude and capped by the limit", () => {
  const prev = Array.from({ length: 20 }, (_, i) => node(`t${i}`, 0.2));
  const curr = prev.map((n, i) => node(n.label, 0.2 + 0.06 + i * 0.02)); // all rise above threshold
  const diff = diffNebulaNodes(prev, curr, 3);
  assert.equal(diff.rose.length, 3, "capped to the limit");
  assert.equal(diff.counts.rose, 20, "count reflects the full set, not the shown slice");
  assert.ok(diff.rose[0].delta >= diff.rose[1].delta && diff.rose[1].delta >= diff.rose[2].delta, "sorted by magnitude");
});

test("summary deltas subtract numeric metrics and tolerate missing values", () => {
  const deltas = diffSummaries(
    { totalTerms: 100, positiveGravity: 40, missingDesiredTerms: 5 },
    { totalTerms: 130, positiveGravity: 55, competitorGravity: 12 },
    ["totalTerms", "positiveGravity", "missingDesiredTerms", "competitorGravity"],
  );
  const by = Object.fromEntries(deltas.map((d) => [d.key, d]));
  assert.equal(by.totalTerms.delta, 30);
  assert.equal(by.positiveGravity.delta, 15);
  assert.equal(by.missingDesiredTerms.delta, null, "metric absent this run → no delta");
  assert.equal(by.competitorGravity.delta, null, "metric absent last run → no delta");
});

test("empty previous snapshot makes everything appeared", () => {
  const diff = diffNebulaNodes([], [node("a", 0.5), node("b", 0.3)]);
  assert.equal(diff.counts.appeared, 2);
  assert.equal(diff.disappeared.length, 0);
});

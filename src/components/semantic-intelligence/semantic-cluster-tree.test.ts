import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildClusterTree,
  clusterExpansion,
  LOD_EXPAND_MAX_PX,
  LOD_EXPAND_MIN_PX,
} from "@/components/semantic-intelligence/semantic-cluster-tree";
import { adaptNebulaNodes } from "@/components/semantic-intelligence/universe-adapter";

function field(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    term: `term-${i}`,
    termType: i % 7 === 0 ? "RISK" : "DESCRIPTIVE",
    polarity: "NEUTRAL",
    semanticGravity: (i * 37) % 100,
    frequencyScore: (i * 13) % 100,
    evidenceConfidence: (i * 29) % 100,
    context: {},
  }));
  return adaptNebulaNodes(rows, Number.POSITIVE_INFINITY, undefined, false);
}

test("clusters cover every node exactly once — the long tail is indexed, never dropped", () => {
  const nodes = field(5200);
  const tree = buildClusterTree(nodes);
  assert.ok(tree.clusters.length > 0 && tree.clusters.length <= 120, `cluster count out of range: ${tree.clusters.length}`);

  const seen = new Set<number>();
  for (const cluster of tree.clusters) {
    assert.ok(cluster.members.length > 0, "no empty clusters");
    assert.ok(cluster.reps.length > 0 && cluster.reps.every((i) => cluster.members.includes(i)), "reps are members");
    for (const index of cluster.members) {
      assert.ok(!seen.has(index), `node ${index} placed in two clusters`);
      seen.add(index);
    }
  }
  assert.equal(seen.size, nodes.length, "every node belongs to exactly one cluster");
});

test("a cluster is one semantic colour and its centroid stays inside the field", () => {
  const nodes = field(1200);
  for (const cluster of buildClusterTree(nodes).clusters) {
    assert.ok(cluster.members.every((i) => nodes[i].type === cluster.type), "cluster mixes types");
    for (const c of [cluster.cx, cluster.cy, cluster.cz]) assert.ok(Math.abs(c) < 2, `centroid ${c} out of range`);
    assert.ok(cluster.intensity > 0 && cluster.intensity <= 1);
  }
});

test("building the tree never mutates node coordinates", () => {
  const nodes = field(400);
  const before = nodes.map((n) => `${n.x},${n.y},${n.z}`);
  buildClusterTree(nodes);
  assert.deepEqual(nodes.map((n) => `${n.x},${n.y},${n.z}`), before);
});

test("expansion cross-fades across the LOD band and is monotonic — no popping", () => {
  assert.equal(clusterExpansion(LOD_EXPAND_MIN_PX - 5), 0, "far cluster stays a glow");
  assert.equal(clusterExpansion(LOD_EXPAND_MAX_PX + 5), 1, "close cluster fully opens");
  const mid = clusterExpansion((LOD_EXPAND_MIN_PX + LOD_EXPAND_MAX_PX) / 2);
  assert.ok(mid > 0 && mid < 1, "mid-band cross-fades");
  let previous = 0;
  for (let px = 0; px <= LOD_EXPAND_MAX_PX + 40; px += 2) {
    const t = clusterExpansion(px);
    assert.ok(t >= previous, `expansion must be monotonic (${t} < ${previous})`);
    previous = t;
  }
});

test("empty field yields no clusters", () => {
  assert.deepEqual(buildClusterTree([]).clusters, []);
});

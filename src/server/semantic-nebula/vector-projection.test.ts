import assert from "node:assert/strict";
import { test } from "node:test";
import { projectTo3D } from "@/server/semantic-nebula/vector-projection";

function seeded(n: number) {
  let s = n;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

test("anchor point lands exactly at the origin", () => {
  const vs = [
    [1, 2, 3, 4],
    [2, 0, 1, 5],
    [0, 3, 2, 1],
    [4, 1, 0, 2],
  ];
  const p = projectTo3D(vs, 0);
  assert.ok(Math.abs(p[0].x) < 1e-9 && Math.abs(p[0].y) < 1e-9 && Math.abs(p[0].z) < 1e-9);
});

test("coordinates are scaled into ~[-1,1]", () => {
  const rnd = seeded(11);
  const vs = Array.from({ length: 40 }, () => Array.from({ length: 16 }, () => rnd() * 10));
  const p = projectTo3D(vs);
  let max = 0;
  for (const q of p) max = Math.max(max, Math.abs(q.x), Math.abs(q.y), Math.abs(q.z));
  assert.ok(max <= 1.0001, `max ${max}`);
  assert.ok(max > 0.5, `expected something near the [-1,1] edge, got ${max}`);
});

test("variance concentrates on x: a dominant axis maps to the first component", () => {
  // spread ~100x larger along dim 0 than the rest
  const rnd = seeded(5);
  const vs = Array.from({ length: 30 }, (_, i) => [i * 3, rnd() * 0.03, rnd() * 0.03, rnd() * 0.03]);
  const p = projectTo3D(vs);
  const range = (sel: (q: { x: number; y: number; z: number }) => number) =>
    Math.max(...p.map(sel)) - Math.min(...p.map(sel));
  assert.ok(range((q) => q.x) > range((q) => q.y) * 5, "x should carry the dominant variance");
});

test("two clusters stay separated after projection", () => {
  const rnd = seeded(3);
  const dim = 24;
  const a = Array.from({ length: 20 }, () => Array.from({ length: dim }, (_, i) => (i < 12 ? 5 : 0) + rnd() * 0.4));
  const b = Array.from({ length: 20 }, () => Array.from({ length: dim }, (_, i) => (i < 12 ? 0 : 5) + rnd() * 0.4));
  const p = projectTo3D(a.concat(b));
  const centroid = (pts: typeof p) => ({
    x: pts.reduce((s, q) => s + q.x, 0) / pts.length,
    y: pts.reduce((s, q) => s + q.y, 0) / pts.length,
    z: pts.reduce((s, q) => s + q.z, 0) / pts.length,
  });
  const ca = centroid(p.slice(0, 20)),
    cb = centroid(p.slice(20));
  const between = Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z);
  const within =
    p.slice(0, 20).reduce((s, q) => s + Math.hypot(q.x - ca.x, q.y - ca.y, q.z - ca.z), 0) / 20;
  assert.ok(between > within * 2, `clusters should separate: between ${between.toFixed(2)} vs within ${within.toFixed(2)}`);
});

test("deterministic — same input yields identical output", () => {
  const rnd = seeded(9);
  const vs = Array.from({ length: 25 }, () => Array.from({ length: 12 }, () => rnd()));
  assert.deepEqual(projectTo3D(vs, 2), projectTo3D(vs, 2));
});

test("degenerate inputs don't throw", () => {
  assert.deepEqual(projectTo3D([]), []);
  assert.deepEqual(projectTo3D([[1, 2, 3]]), [{ x: 0, y: 0, z: 0 }]);
});

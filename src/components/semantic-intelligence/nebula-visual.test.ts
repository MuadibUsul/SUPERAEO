import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nodeEvidenceScore,
  nodeVisualRadius,
  overviewRevealAlpha,
  overviewRevealFloor,
} from "@/components/semantic-intelligence/nebula-visual";
import { adaptNebulaNodes } from "@/components/semantic-intelligence/universe-adapter";

test("node radius grows continuously with strength — no size cliff between ranks", () => {
  const scale = 1;
  let previous = nodeVisualRadius(0, scale);
  let maxStep = 0;
  let smoothStep = 0; // largest step away from the steep sqrt origin
  for (let i = 1; i <= 1000; i++) {
    const strength = i / 1000;
    const radius = nodeVisualRadius(strength, scale);
    assert.ok(radius >= previous, `radius must be monotonic in strength (${radius} < ${previous})`);
    const step = radius - previous;
    maxStep = Math.max(maxStep, step);
    if (strength >= 0.05) smoothStep = Math.max(smoothStep, step);
    previous = radius;
  }
  // The sqrt curve is smooth everywhere and, away from the near-zero knee, moves
  // in tiny increments — the opposite of a rank-based caste that jumps at a fixed
  // top-N boundary. Even the steepest near-zero step stays small and bounded.
  assert.ok(smoothStep < 0.02, `radius jumped by ${smoothStep} across a 0.001 strength step`);
  assert.ok(maxStep < 0.2, `even the sqrt knee should stay bounded, got ${maxStep}`);
});

test("node radius is softly bounded and scales with projection", () => {
  assert.ok(nodeVisualRadius(1, 100) <= 16, "radius is capped for very close nodes");
  assert.ok(nodeVisualRadius(0, 0.0001) >= 0.9, "radius has a visible floor");
  assert.ok(nodeVisualRadius(0.9, 2) > nodeVisualRadius(0.9, 1), "closer projection reads larger");
});

test("size keeps a relevance hierarchy even at deep zoom", () => {
  // A single flat cap would clamp every node to the same disc up close; the
  // relevance-scaled ceiling keeps low-relevance nodes smaller than high ones
  // no matter how far the camera dives.
  assert.ok(nodeVisualRadius(0.2, 100) < nodeVisualRadius(0.9, 100), "low relevance stays smaller than high, zoomed in");
  assert.ok(nodeVisualRadius(0.5, 100) < nodeVisualRadius(0.9, 100), "mid relevance stays smaller than high, zoomed in");
});

test("evidence score is confidence-led and stays within 0..1", () => {
  const strong = nodeEvidenceScore({ confidence: 0.9, affinity: 0.8, strength: 0.7 });
  const weak = nodeEvidenceScore({ confidence: 0.05, affinity: 0.1, strength: 0.1 });
  assert.ok(strong > weak);
  assert.ok(strong <= 1 && weak >= 0);
  // confidence carries more weight than gravity
  const byConfidence = nodeEvidenceScore({ confidence: 0.8, affinity: 0.2, strength: 0.2 });
  const byGravity = nodeEvidenceScore({ confidence: 0.2, affinity: 0.2, strength: 0.8 });
  assert.ok(byConfidence > byGravity, "confidence should outweigh raw gravity");
});

test("overview floor is high zoomed out and falls to zero on a close dive", () => {
  assert.equal(overviewRevealFloor(1), 0.32, "resting overview keeps the full floor");
  assert.ok(overviewRevealFloor(0.5) === 0.32, "further out is capped at the same floor");
  assert.equal(overviewRevealFloor(6), 0, "a close dive removes the floor entirely");
  assert.ok(overviewRevealFloor(2) < overviewRevealFloor(1), "zooming in lowers the floor");
});

test("overview reveal prioritizes high-evidence nodes yet never deletes the long tail", () => {
  // Zoomed out: a well-supported node is full, a long-tail node is only faded.
  const strong = overviewRevealAlpha(0.5, 1);
  const faint = overviewRevealAlpha(0.05, 1);
  assert.equal(strong, 1, "high-evidence nodes lead the overview");
  assert.ok(faint > 0, "long-tail nodes are never fully removed");
  assert.ok(faint < strong, "long-tail nodes are de-emphasized, not hidden");
  // Zoomed in: the same faint node re-emerges fully.
  assert.equal(overviewRevealAlpha(0.05, 6), 1, "zoom re-reveals the long tail");
});

test("5,000+ nodes survive intact: none dropped, coordinates bounded, radii continuous", () => {
  const many = Array.from({ length: 5200 }, (_, i) => ({
    term: `term-${i}`,
    termType: i % 7 === 0 ? "RISK" : "DESCRIPTIVE",
    polarity: "NEUTRAL",
    semanticGravity: (i * 37) % 100,
    frequencyScore: (i * 13) % 100,
    evidenceConfidence: (i * 29) % 100,
    context: {},
  }));
  const out = adaptNebulaNodes(many, Number.POSITIVE_INFINITY, undefined, false);
  assert.equal(out.length, 5200, "every collected node is kept — low evidence is not deleted");
  for (const node of out) {
    for (const c of [node.x, node.y, node.z]) assert.ok(Math.abs(c) < 2, `coord ${c} out of range`);
  }
  // Sorted by strength, adjacent visual radii step smoothly. Strengths here are
  // discrete to 0.01, so the only sizeable step is across the sqrt knee near
  // zero — still a fraction of a pixel, nothing like a rank-based caste jump.
  let maxStep = 0;
  for (let i = 1; i < out.length; i++) {
    maxStep = Math.max(maxStep, Math.abs(nodeVisualRadius(out[i].strength, 1) - nodeVisualRadius(out[i - 1].strength, 1)));
  }
  assert.ok(maxStep < 0.6, `size cliff between adjacent nodes: ${maxStep}`);
});

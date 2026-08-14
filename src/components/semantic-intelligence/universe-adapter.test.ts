import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptNebulaNodes } from "@/components/semantic-intelligence/universe-adapter";

const nodes = [
  { term: "AI observability", termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: 90, frequencyScore: 80, context: {} },
  { term: "Datadog", termType: "COMPETITOR", polarity: "NEUTRAL", semanticGravity: 30, frequencyScore: 60, context: { competitorContext: true } },
  { term: "confusion", termType: "RISK", polarity: "NEGATIVE", semanticGravity: 50, frequencyScore: 40, context: { riskContext: true } },
  { term: "RAG eval", termType: "SCENARIO", polarity: "NEUTRAL", semanticGravity: 45, frequencyScore: 50, context: {} },
  { term: "", termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: 10, frequencyScore: 10, context: {} },
];

test("classifies each node into a universe type", () => {
  const out = adaptNebulaNodes(nodes);
  const by = Object.fromEntries(out.map((n) => [n.label, n.type]));
  assert.equal(by["AI observability"], "positive");
  assert.equal(by["Datadog"], "competitor");
  assert.equal(by["confusion"], "risk");
  assert.equal(by["RAG eval"], "usecase");
});

test("drops empty labels", () => {
  const out = adaptNebulaNodes(nodes);
  assert.ok(!out.some((n) => n.label === ""));
  assert.equal(out.length, 4);
});

test("strength maps 0..1 and a strong term sits closer to the origin than a weak one", () => {
  const out = adaptNebulaNodes(nodes);
  const strong = out.find((n) => n.label === "AI observability")!; // gravity 90
  const weak = out.find((n) => n.label === "Datadog")!; // gravity 30
  assert.equal(strong.strength, 0.9);
  const dStrong = Math.hypot(strong.x, strong.y, strong.z);
  const dWeak = Math.hypot(weak.x, weak.y, weak.z);
  assert.ok(dStrong < dWeak, `strong ${dStrong.toFixed(2)} should be nearer than weak ${dWeak.toFixed(2)}`);
});

test("deterministic and coordinate-bounded", () => {
  assert.deepEqual(adaptNebulaNodes(nodes), adaptNebulaNodes(nodes));
  for (const n of adaptNebulaNodes(nodes)) {
    for (const c of [n.x, n.y, n.z]) assert.ok(Math.abs(c) < 1.5, `coord ${c} out of range`);
  }
});

test("carries evidence quotes, drops empty excerpts, and falls back model->source", () => {
  const withEv = [
    {
      term: "x", termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: 80, frequencyScore: 50, context: {},
      examples: [
        { question: "Would you recommend x?", excerpt: "quote one", provider: "GPT" },
        { excerpt: "quote two", model: "sonar" },
        { excerpt: "" },
      ],
    },
  ];
  const out = adaptNebulaNodes(withEv);
  assert.equal(out[0].examples.length, 2);
  assert.equal(out[0].examples[0].excerpt, "quote one");
  assert.equal(out[0].examples[0].source, "GPT");
  assert.equal(out[0].examples[1].source, "sonar");
});

test("real embedding coords win over the gravity fallback when present", () => {
  const withCoords = [
    { term: "embedded", termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: 90, frequencyScore: 50, context: {}, x: 0.4, y: -0.1, z: 0.2 },
    { term: "fallback", termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: 90, frequencyScore: 50, context: {} },
  ];
  const out = adaptNebulaNodes(withCoords);
  const a = out.find((n) => n.label === "embedded")!;
  assert.deepEqual({ x: a.x, y: a.y, z: a.z }, { x: 0.4, y: -0.1, z: 0.2 });
  // the coordless one is NOT at those exact coords (fallback layout)
  const b = out.find((n) => n.label === "fallback")!;
  assert.notDeepEqual({ x: b.x, y: b.y, z: b.z }, { x: 0.4, y: -0.1, z: 0.2 });
});

test("display coordinates soften severe one-sided collapse without changing semantic radii", () => {
  const oneSided = Array.from({ length: 20 }, (_, i) => ({
    term: `one-sided-${i}`, termType: "SCENARIO", polarity: "NEUTRAL", semanticGravity: 80 - i, frequencyScore: 50, context: {},
    x: -0.18 - i * 0.025, y: (i - 9.5) * 0.025, z: ((i % 5) - 2) * 0.035,
  }));
  const out = adaptNebulaNodes(oneSided);
  const positive = out.filter((node) => node.x > 0).length;
  const negative = out.filter((node) => node.x < 0).length;

  assert.ok(positive > 0 && negative > 0, `expected both display hemispheres, got ${positive}/${negative}`);
  assert.ok(new Set(out.map((node) => Math.hypot(node.x, node.y, node.z).toFixed(6))).size > 10, "display layout should not flatten nodes into a uniform shell");
  out.forEach((node, index) => {
    assert.equal(node.rawX, oneSided[index].x);
    assert.equal(node.rawY, oneSided[index].y);
    assert.equal(node.rawZ, oneSided[index].z);
    assert.ok(Math.abs(Math.hypot(node.x, node.y, node.z) - Math.hypot(node.rawX, node.rawY, node.rawZ)) < 1e-10);
  });
});

test("a model layer uses its real coordinates and excludes terms outside that layer", () => {
  const layered = [
    {
      term: "shared", termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: 90, frequencyScore: 50, context: {},
      x: 0.1, y: 0.2, z: 0.3,
      modelPositions: { "model-a": { x: -0.4, y: 0.5, z: 0.6 } },
    },
    {
      term: "other", termType: "SCENARIO", polarity: "NEUTRAL", semanticGravity: 70, frequencyScore: 40, context: {},
      x: 0.7, y: 0.8, z: 0.9,
      modelPositions: { "model-b": { x: 0.2, y: 0.3, z: 0.4 } },
    },
  ];
  const out = adaptNebulaNodes(layered, 160, "model-a");
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "shared");
  assert.deepEqual({ x: out[0].x, y: out[0].y, z: out[0].z }, { x: -0.4, y: 0.5, z: 0.6 });
});

test("nodes without examples get an empty array", () => {
  const out = adaptNebulaNodes(nodes);
  assert.ok(out.every((n) => Array.isArray(n.examples)));
});

test("respects the limit and handles non-array input", () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ term: `t${i}`, termType: "POSITIVE", polarity: "POSITIVE", semanticGravity: i % 100, frequencyScore: 50, context: {} }));
  assert.equal(adaptNebulaNodes(many, 120).length, 120);
  assert.deepEqual(adaptNebulaNodes(null), []);
  assert.deepEqual(adaptNebulaNodes(undefined), []);
});

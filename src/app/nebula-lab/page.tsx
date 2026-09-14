"use client";

/**
 * Dev-only harness for eyeballing the semantic LOD render. Not linked from the
 * app and not locale-scoped — it just generates a large synthetic field so the
 * cluster/glow path (which only activates above ~220 nodes) can be seen without a
 * seeded database. Safe to delete once the look is signed off.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { CognitionUniverse } from "@/components/semantic-intelligence/cognition-universe";
import { adaptNebulaNodes } from "@/components/semantic-intelligence/universe-adapter";

// A spread of archetypes so the field shows every semantic colour and clusters
// land in different sectors.
const ARCHETYPES: Array<Record<string, unknown>> = [
  { termType: "POSITIVE", polarity: "POSITIVE", semanticMeta: { domain: "ATTRIBUTE", type: "STRENGTH" } },
  { termType: "RISK", polarity: "NEGATIVE", semanticMeta: { domain: "RISK_OPPORTUNITY", type: "THREAT" } },
  { termType: "DESCRIPTIVE", polarity: "NEUTRAL", semanticMeta: { domain: "RISK_OPPORTUNITY", type: "OPPORTUNITY" } },
  { termType: "COMPETITOR", polarity: "NEUTRAL", context: { competitorContext: true }, semanticMeta: { domain: "ENTITY", type: "RIVAL" } },
  { termType: "ENTITY", polarity: "NEUTRAL", semanticMeta: { domain: "ENTITY", type: "ORG" } },
  { termType: "DESCRIPTIVE", polarity: "NEUTRAL", semanticMeta: { domain: "ATTRIBUTE", type: "FEATURE" } },
  { termType: "SCENARIO", polarity: "NEUTRAL", semanticMeta: { domain: "CONTEXT", type: "AUDIENCE" } },
  { termType: "FUNCTIONAL", polarity: "NEUTRAL", semanticMeta: { domain: "ACTION", type: "EVENT" } },
  { termType: "DESCRIPTIVE", polarity: "NEUTRAL", semanticMeta: { domain: "RELATION", type: "LINK" } },
  { termType: "DESCRIPTIVE", polarity: "NEUTRAL", semanticMeta: { domain: "EVIDENCE", type: "CITATION" } },
];

const WORDS = ["利率", "黄金", "通胀", "美债", "政策", "avalanche", "signal", "yield", "hedge", "momentum", "spread", "carry", "beta", "flow", "risk", "regime"];

function makeRows(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const w1 = WORDS[(i * 7) % WORDS.length];
    const w2 = WORDS[(i * 13 + 3) % WORDS.length];
    return {
      ...arch,
      term: `${w1}-${w2}-${i}`,
      semanticGravity: 8 + ((i * 37) % 92),
      frequencyScore: (i * 13) % 100,
      proximityScore: (i * 19) % 100,
      evidenceConfidence: 20 + ((i * 29) % 80),
      context: arch.context ?? {},
    };
  });
}

export default function NebulaLabPage() {
  const [count, setCount] = useState(5000);
  const nodes = useMemo(() => adaptNebulaNodes(makeRows(count), Number.POSITIVE_INFINITY, undefined, false), [count]);

  const [fps, setFps] = useState(0);
  const fpsRef = useRef({ frames: 0, last: performance.now() });
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = fpsRef.current;
      s.frames += 1;
      const now = performance.now();
      if (now - s.last >= 500) {
        setFps(Math.round((s.frames * 1000) / (now - s.last)));
        s.frames = 0;
        s.last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#04050a", color: "#e6e9f2", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>Semantic LOD lab</strong>
        <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.8 }}>{nodes.length} nodes · {fps} fps</span>
        {[500, 2000, 5000, 10000].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCount(n)}
            style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.15)",
              background: count === n ? "rgba(65,220,235,0.22)" : "rgba(255,255,255,0.04)",
              color: "#e6e9f2",
            }}
          >
            {n}
          </button>
        ))}
        <span style={{ fontSize: 11, opacity: 0.6 }}>drag to orbit · scroll / click a glow to fly in · double-click to dive</span>
      </div>
      <CognitionUniverse subjectName="LOD Lab" nodes={nodes} className="h-[78vh]" />
    </div>
  );
}

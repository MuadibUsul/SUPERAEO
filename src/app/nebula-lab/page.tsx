"use client";

/**
 * Dev-only harness for eyeballing the semantic LOD render. Not linked from the
 * app and not locale-scoped — it just generates a large synthetic field so the
 * cluster/glow path (which only activates above ~220 nodes) can be seen without a
 * seeded database. Safe to delete once the look is signed off.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { CognitionUniverse } from "@/components/semantic-intelligence/cognition-universe";
import { NebulaChangePanel } from "@/components/semantic-intelligence/nebula-change-panel";
import { adaptNebulaNodes } from "@/components/semantic-intelligence/universe-adapter";
import { diffNebulaNodes } from "@/components/semantic-intelligence/nebula-diff";

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

function makeRows(count: number, previous = false) {
  return Array.from({ length: count }, (_, i) => {
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const w1 = WORDS[(i * 7) % WORDS.length];
    const w2 = WORDS[(i * 13 + 3) % WORDS.length];
    // In the synthetic "previous" run the first 24 terms are different words (so
    // the current run reads them as newly appeared and the old ones as fallen
    // away), and everyone's proximity/confidence is shifted so relevance moves.
    const term = previous && i < 24 ? `legacy-${w2}-${i}` : `${w1}-${w2}-${i}`;
    return {
      ...arch,
      term,
      semanticGravity: 8 + ((i * 37) % 92),
      frequencyScore: (i * 13) % 100,
      proximityScore: previous ? ((i * 19 + 45) % 100) : (i * 19) % 100,
      evidenceConfidence: previous ? Math.max(10, 20 + ((i * 29) % 80) - 22) : 20 + ((i * 29) % 80),
      context: arch.context ?? {},
    };
  });
}

export default function NebulaLabPage() {
  const [count, setCount] = useState(5000);
  const nodes = useMemo(() => adaptNebulaNodes(makeRows(count), Number.POSITIVE_INFINITY, undefined, false), [count]);
  const previousNodes = useMemo(() => adaptNebulaNodes(makeRows(count, true), Number.POSITIVE_INFINITY, undefined, false), [count]);
  const diff = useMemo(() => diffNebulaNodes(previousNodes, nodes), [previousNodes, nodes]);

  const [fps, setFps] = useState(0);
  // last starts at 0 and is seeded inside the effect — calling performance.now()
  // in the useRef initializer would be an impure call during render.
  const fpsRef = useRef({ frames: 0, last: 0 });
  useEffect(() => {
    let raf = 0;
    fpsRef.current.last = performance.now();
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
      <CognitionUniverse subjectName="LOD Lab" nodes={nodes} className="h-[62vh]" />

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8, fontFamily: "monospace" }}>
          time-comparison prototype (synthetic previous run)
        </div>
        <NebulaChangePanel diff={diff} hasPrevious previousAt="Sep 8" currentAt="Sep 15" />
      </div>
    </div>
  );
}

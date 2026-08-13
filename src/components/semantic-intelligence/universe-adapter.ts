/**
 * Adapt stored nebula nodes into cognition-universe nodes.
 *
 * Today's nodeJson has no coordinates, so we derive a deterministic 3D layout
 * from what the audit measured: type decides the sector direction, semantic
 * gravity decides distance from the entity (strong = close). When the
 * embedding vector space lands, real x/y/z replace `layout` here and nothing
 * else changes.
 */
import { asRecord } from "@/server/utils/coerce";

export type UniverseType = "positive" | "usecase" | "competitor" | "risk";
export type UniverseEvidence = { question: string; excerpt: string; source: string };
export type UniverseNode = {
  label: string;
  type: UniverseType;
  strength: number; // 0..1
  freq: number; // 0..1
  x: number;
  y: number;
  z: number;
  /** Raw AI quotes that placed this term near the entity. */
  examples: UniverseEvidence[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function extractExamples(raw: unknown): UniverseEvidence[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 5)
    .map(asRecord)
    .map((e) => ({ question: str(e.question), excerpt: str(e.excerpt), source: str(e.provider) || str(e.model) }))
    .filter((e) => e.excerpt.length > 0);
}

const SECTOR_DIR: Record<UniverseType, [number, number, number]> = {
  positive: [-0.25, -0.62, 0.18],
  usecase: [0.68, -0.05, 0.28],
  competitor: [-0.72, 0.34, -0.22],
  risk: [0.22, 0.5, 0.24],
};

function classify(termType: string, polarity: string, context: Record<string, unknown>): UniverseType {
  const tt = termType.toUpperCase();
  if (context.competitorContext === true || tt === "COMPETITOR") return "competitor";
  if (
    context.riskContext === true ||
    context.missingDesired === true ||
    ["RISK", "INCORRECT", "UNDESIRED", "NEGATIVE", "MISSING"].includes(tt)
  ) {
    return "risk";
  }
  if (polarity.toUpperCase() === "POSITIVE" || ["POSITIVE", "BENEFIT", "TRUST"].includes(tt)) return "positive";
  return "usecase";
}

/** Deterministic hash → [0,1) for stable jitter. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function adaptNebulaNodes(nodeJson: unknown, limit = 160): UniverseNode[] {
  const rows = Array.isArray(nodeJson) ? nodeJson : [];
  const nodes = rows
    .map((raw) => asRecord(raw))
    .map((r) => {
      const label = String(r.term ?? r.normalizedTerm ?? "").trim();
      const type = classify(String(r.termType ?? ""), String(r.polarity ?? ""), asRecord(r.context));
      const strength = Math.max(0, Math.min(1, num(r.semanticGravity) / 100));
      const freq = Math.max(0, Math.min(1, num(r.frequencyScore) / 100));
      const hasCoords = typeof r.x === "number" && typeof r.y === "number" && typeof r.z === "number";
      return {
        label, type, strength, freq, examples: extractExamples(r.examples),
        hasCoords, sx: num(r.x), sy: num(r.y), sz: num(r.z),
      };
    })
    .filter((n) => n.label.length > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);

  return nodes.map((n) => {
    // real embedding coordinates win when present; otherwise a deterministic
    // gravity-driven fallback (strong terms near the entity, weak ones outward)
    let x: number, y: number, z: number;
    if (n.hasCoords) {
      x = n.sx; y = n.sy; z = n.sz;
    } else {
      const dir = SECTOR_DIR[n.type];
      const dist = 0.28 + (1 - n.strength) * 0.72;
      const j = (seed: number) => (hash01(n.label + seed) - 0.5) * 0.28;
      x = dir[0] * dist + j(1);
      y = dir[1] * dist + j(2);
      z = dir[2] * dist + j(3);
    }
    return { label: n.label, type: n.type, strength: n.strength, freq: n.freq, examples: n.examples, x, y, z };
  });
}

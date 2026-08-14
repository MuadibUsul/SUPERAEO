/**
 * Adapt stored nebula nodes into cognition-universe nodes.
 *
 * Real embedding coordinates are preferred. Older snapshots without them use
 * a deterministic gravity layout. A model layer can select its own stored
 * position and hides terms that the selected answer model did not produce.
 */
import { asRecord } from "@/server/utils/coerce";

export type UniverseType = "positive" | "risk" | "opportunity" | "competitor" | "entity" | "attribute" | "context" | "activity" | "relation" | "evidence";
export type UniverseEvidence = { question: string; excerpt: string; source: string };
export type UniverseNode = {
  evidenceKey: string;
  label: string;
  type: UniverseType;
  strength: number; // 0..1
  freq: number; // 0..1
  affinity: number; // 0..1 relationship to the subject
  confidence: number; // 0..1 evidence confidence
  domain: string;
  semanticType: string;
  x: number;
  y: number;
  z: number;
  rawX: number;
  rawY: number;
  rawZ: number;
  /** Raw AI quotes that placed this term near the entity. */
  examples: UniverseEvidence[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function extractNebulaEvidence(raw: unknown): UniverseEvidence[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 5)
    .map(asRecord)
    .map((e) => ({ question: str(e.question), excerpt: str(e.excerpt), source: str(e.provider) || str(e.model) }))
    .filter((e) => e.excerpt.length > 0);
}

const SECTOR_DIR: Record<UniverseType, [number, number, number]> = {
  positive: [-0.25, -0.62, 0.18],
  risk: [0.22, 0.5, 0.24],
  opportunity: [0.64, -0.38, 0.2],
  competitor: [-0.72, 0.34, -0.22],
  entity: [-0.58, -0.18, 0.44],
  attribute: [0.48, -0.1, -0.5],
  context: [0.68, 0.18, 0.28],
  activity: [-0.08, 0.72, -0.28],
  relation: [-0.52, 0.5, 0.18],
  evidence: [0.12, -0.72, -0.28],
};

function classify(termType: string, polarity: string, context: Record<string, unknown>, semanticMeta: Record<string, unknown>): UniverseType {
  const tt = termType.toUpperCase();
  const domain = str(semanticMeta.domain).toUpperCase();
  const semanticType = str(semanticMeta.type).toUpperCase();
  if (context.competitorContext === true || tt === "COMPETITOR") return "competitor";
  if (
    context.riskContext === true ||
    context.missingDesired === true ||
    ["RISK", "INCORRECT", "UNDESIRED", "NEGATIVE", "MISSING"].includes(tt) ||
    ["RISK", "THREAT", "CONSTRAINT", "EXPOSURE", "WEAKNESS", "DISADVANTAGE", "LIMITATION", "VULNERABILITY", "UNDERPERFORMANCE"].includes(semanticType)
  ) {
    return "risk";
  }
  if (domain === "RISK_OPPORTUNITY") return ["OPPORTUNITY", "POTENTIAL", "GROWTH_AREA", "EMERGING_MARKET", "WHITE_SPACE"].includes(semanticType) ? "opportunity" : "risk";
  if (["SCENARIO", "AUDIENCE"].includes(tt)) return "context";
  if (tt === "FUNCTIONAL") return "activity";
  if (domain === "ENTITY") return "entity";
  if (domain === "CONTEXT") return "context";
  if (domain === "RELATION") return "relation";
  if (domain === "EVIDENCE") return "evidence";
  if (["ACTION", "EVENT", "FUNCTION", "CAUSE_EFFECT", "TEMPORAL", "QUANTITATIVE"].includes(domain)) return "activity";
  if (
    polarity.toUpperCase() === "POSITIVE" ||
    ["POSITIVE", "BENEFIT", "TRUST"].includes(tt) ||
    ["ADVANTAGE", "STRENGTH", "MOAT", "BENEFIT", "OUTPERFORMANCE", "RECOMMENDATION"].includes(semanticType)
  ) return "positive";
  return "attribute";
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

export function adaptNebulaNodes(
  nodeJson: unknown,
  limit = Number.POSITIVE_INFINITY,
  modelLayer?: string,
  includeExamples = true,
): UniverseNode[] {
  const rows = Array.isArray(nodeJson) ? nodeJson : [];
  const nodes = rows
    .map((raw) => asRecord(raw))
    .map((r, index) => {
      const layerPosition = modelLayer ? asRecord(asRecord(r.modelPositions)[modelLayer]) : r;
      const semanticMeta = asRecord(r.semanticMeta);
      const label = String(r.term ?? r.normalizedTerm ?? "").trim();
      // Index-suffixed so a node missing every identifying field still gets a key
      // unique to itself. A shared empty key made selection match every such node.
      const evidenceKey = str(r.id) || str(r.normalizedTerm) || label || `node:${index}`;
      const type = classify(String(r.termType ?? ""), String(r.polarity ?? ""), asRecord(r.context), semanticMeta);
      const strength = Math.max(0, Math.min(1, num(r.semanticGravity) / 100));
      const freq = Math.max(0, Math.min(1, num(r.frequencyScore) / 100));
      const proximity = Math.max(0, Math.min(1, num(r.proximityScore, num(r.coMentionStrength)) / 100));
      const confidence = Math.max(0, Math.min(1, num(r.evidenceConfidence, num(semanticMeta.confidence) * 100) / 100));
      const affinity = Math.max(0, Math.min(1, strength * 0.55 + proximity * 0.3 + confidence * 0.15));
      const hasCoords = typeof layerPosition.x === "number" && typeof layerPosition.y === "number" && typeof layerPosition.z === "number";
      return {
        label, type, strength, freq, affinity, confidence,
        domain: str(semanticMeta.domain) || "ATTRIBUTE",
        semanticType: str(semanticMeta.type) || String(r.termType ?? "OTHER"),
        evidenceKey,
        examples: includeExamples ? extractNebulaEvidence(r.examples) : [],
        inLayer: !modelLayer || hasCoords,
        hasCoords, sx: num(layerPosition.x), sy: num(layerPosition.y), sz: num(layerPosition.z),
      };
    })
    .filter((n) => n.label.length > 0 && n.inLayer)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);

  const positioned = nodes.map((n) => {
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
    return { ...n, x, y, z };
  });
  const balanced = balanceDisplayPositions(positioned);
  return positioned.map((n, index) => {
    const display = balanced[index] ?? n;
    return {
      evidenceKey: n.evidenceKey,
      label: n.label, type: n.type, strength: n.strength, freq: n.freq, affinity: n.affinity, confidence: n.confidence,
      domain: n.domain, semanticType: n.semanticType, examples: n.examples,
      x: display.x, y: display.y, z: display.z,
      rawX: n.x, rawY: n.y, rawZ: n.z,
    };
  });
}

function balanceDisplayPositions<T extends { hasCoords: boolean; x: number; y: number; z: number }>(nodes: T[]) {
  const embedded = nodes.filter((node) => node.hasCoords);
  if (embedded.length < 8) return nodes;

  const center = embedded.reduce(
    (sum, node) => ({ x: sum.x + node.x, y: sum.y + node.y, z: sum.z + node.z }),
    { x: 0, y: 0, z: 0 },
  );
  center.x /= embedded.length;
  center.y /= embedded.length;
  center.z /= embedded.length;

  const imbalance = Math.max(
    axisImbalance(embedded.map((node) => node.x)),
    axisImbalance(embedded.map((node) => node.y)),
    axisImbalance(embedded.map((node) => node.z)),
  );
  const correction = Math.max(0, Math.min(1, (imbalance - 0.45) / 0.4));
  if (correction === 0) return nodes;

  return nodes.map((node) => {
    if (!node.hasCoords) return node;
    const radius = Math.hypot(node.x, node.y, node.z);
    const shifted = {
      x: node.x - center.x * correction,
      y: node.y - center.y * correction,
      z: node.z - center.z * correction,
    };
    const shiftedRadius = Math.hypot(shifted.x, shifted.y, shifted.z);
    if (radius === 0 || shiftedRadius === 0) return node;
    const scale = radius / shiftedRadius;
    return { ...node, x: shifted.x * scale, y: shifted.y * scale, z: shifted.z * scale };
  });
}

function axisImbalance(values: number[]) {
  const positive = values.filter((value) => value > 0).length;
  const negative = values.filter((value) => value < 0).length;
  return Math.abs(positive - negative) / Math.max(1, positive + negative);
}

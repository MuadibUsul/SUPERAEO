/**
 * A deterministic demo semantic field for the marketing hero — a believable
 * "how AI sees a brand" universe when there's no real project yet. Shaped like
 * stored nebula nodes and run through the same adapter, so it lays out exactly
 * like real data.
 */
import { adaptNebulaNodes, type UniverseNode } from "@/components/semantic-intelligence/universe-adapter";

type Seed = { term: string; termType: string; polarity: string; gravity: number; freq: number; ctx?: Record<string, unknown> };

const OWNED: Array<[string, number, number]> = [
  ["developer platform", 92, 88], ["fast integration", 84, 70], ["great documentation", 78, 66],
  ["reliable uptime", 74, 60], ["open source", 70, 72], ["modern stack", 64, 54],
  ["strong community", 60, 58], ["secure by default", 56, 50], ["clean API", 68, 62], ["self-serve", 52, 46],
];
const USECASE: Array<[string, number, number]> = [
  ["team collaboration", 66, 58], ["real-time sync", 58, 52], ["automation", 62, 60],
  ["data pipelines", 54, 48], ["reporting", 50, 44], ["access control", 46, 40], ["onboarding", 60, 50], ["migration", 42, 38],
];
const COMPETITOR: Array<[string, number, number]> = [
  ["incumbent suite", 44, 76], ["all-in-one rival", 40, 64], ["enterprise vendor", 36, 58],
  ["legacy platform", 30, 50], ["cheaper alternative", 34, 46], ["open-source rival", 38, 52],
];
const RISK: Array<[string, number, number]> = [
  ["name confusion", 58, 60], ["pricing unclear", 50, 52], ["learning curve", 44, 46],
  ["enterprise readiness", 38, 40], ["support gaps", 34, 36], ["limited regions", 30, 32],
];

function seeds(): Seed[] {
  const out: Seed[] = [];
  for (const [term, gravity, freq] of OWNED) out.push({ term, termType: "POSITIVE", polarity: "POSITIVE", gravity, freq });
  for (const [term, gravity, freq] of USECASE) out.push({ term, termType: "SCENARIO", polarity: "NEUTRAL", gravity, freq });
  for (const [term, gravity, freq] of COMPETITOR) out.push({ term, termType: "COMPETITOR", polarity: "NEUTRAL", gravity, freq, ctx: { competitorContext: true } });
  for (const [term, gravity, freq] of RISK) out.push({ term, termType: "RISK", polarity: "NEGATIVE", gravity, freq, ctx: { riskContext: true } });
  return out;
}

export function demoUniverseNodes(): UniverseNode[] {
  const nodeJson = seeds().map((s) => ({
    term: s.term,
    termType: s.termType,
    polarity: s.polarity,
    semanticGravity: s.gravity,
    frequencyScore: s.freq,
    context: s.ctx ?? {},
  }));
  return adaptNebulaNodes(nodeJson);
}

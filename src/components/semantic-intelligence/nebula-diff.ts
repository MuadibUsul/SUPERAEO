/**
 * Diff two semantic-nebula snapshots to answer "what changed since last run".
 *
 * Nodes are matched across snapshots by their normalized label — NOT by
 * `evidenceKey`, which often carries a per-snapshot database id and so is not
 * stable over time. Relevance change is measured on `affinity` (the same signal
 * that drives node size: how strongly the models' answers tie the term to the
 * subject). Pure and DOM-free so it can be unit-tested.
 */
import type { UniverseNode, UniverseType } from "@/components/semantic-intelligence/universe-adapter";

export type NodeDelta = {
  label: string;
  type: UniverseType;
  /** Current relevance (previous relevance for a disappeared node), 0..1. */
  affinity: number;
  /** current − previous relevance; = +affinity for appeared, −affinity for gone. */
  delta: number;
};

export type NebulaDiff = {
  appeared: NodeDelta[];
  disappeared: NodeDelta[];
  rose: NodeDelta[];
  fell: NodeDelta[];
  counts: { appeared: number; disappeared: number; rose: number; fell: number; stable: number };
};

export type MetricDelta = {
  key: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
};

/** A relevance move smaller than this (5 "points") is treated as noise. */
export const MOVE_THRESHOLD = 0.05;

function labelKey(node: { label: string }) {
  return node.label.trim().toLowerCase();
}

export function diffNebulaNodes(
  previous: UniverseNode[],
  current: UniverseNode[],
  limit = 8,
): NebulaDiff {
  const prevByLabel = new Map<string, UniverseNode>();
  for (const node of previous) {
    const key = labelKey(node);
    if (key && !prevByLabel.has(key)) prevByLabel.set(key, node);
  }
  const seen = new Set<string>();

  const appeared: NodeDelta[] = [];
  const rose: NodeDelta[] = [];
  const fell: NodeDelta[] = [];
  let stable = 0;

  for (const node of current) {
    const key = labelKey(node);
    if (!key) continue;
    seen.add(key);
    const prior = prevByLabel.get(key);
    if (!prior) {
      appeared.push({ label: node.label, type: node.type, affinity: node.affinity, delta: node.affinity });
      continue;
    }
    const delta = node.affinity - prior.affinity;
    if (delta >= MOVE_THRESHOLD) rose.push({ label: node.label, type: node.type, affinity: node.affinity, delta });
    else if (delta <= -MOVE_THRESHOLD) fell.push({ label: node.label, type: node.type, affinity: node.affinity, delta });
    else stable += 1;
  }

  const disappeared: NodeDelta[] = [];
  for (const node of previous) {
    const key = labelKey(node);
    if (!key || seen.has(key)) continue;
    disappeared.push({ label: node.label, type: node.type, affinity: node.affinity, delta: -node.affinity });
  }

  const counts = {
    appeared: appeared.length,
    disappeared: disappeared.length,
    rose: rose.length,
    fell: fell.length,
    stable,
  };

  appeared.sort((a, b) => b.affinity - a.affinity);
  disappeared.sort((a, b) => b.affinity - a.affinity);
  rose.sort((a, b) => b.delta - a.delta);
  fell.sort((a, b) => a.delta - b.delta);

  return {
    appeared: appeared.slice(0, limit),
    disappeared: disappeared.slice(0, limit),
    rose: rose.slice(0, limit),
    fell: fell.slice(0, limit),
    counts,
  };
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Numeric deltas for named summary metrics between two snapshots. */
export function diffSummaries(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  keys: string[],
): MetricDelta[] {
  return keys.map((key) => {
    const prev = num(previous[key]);
    const curr = num(current[key]);
    const delta = prev !== null && curr !== null ? curr - prev : null;
    return { key, previous: prev, current: curr, delta };
  });
}

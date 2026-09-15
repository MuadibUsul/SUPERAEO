/**
 * Semantic cluster tree — a static spatial index over the nebula's nodes.
 *
 * The cognition universe keeps every node (the long tail is never deleted), but
 * drawing 5,000+ dots every frame is what makes the canvas stutter. This module
 * groups nodes by semantic type and spatial cell so the renderer can draw a
 * handful of glowing clusters when the camera is far and only expand a cluster
 * into its member nodes when the camera is close enough to tell them apart —
 * the Google-Earth / LOD trick, applied to an embedding field.
 *
 * Pure and DOM-free so the clustering and the level-of-detail thresholds can be
 * unit-tested. It never mutates a node, moves a coordinate, or drops a member:
 * `members` indexes back into the exact array it was given.
 */
import type { UniverseNode, UniverseType } from "@/components/semantic-intelligence/universe-adapter";

export type NebulaCluster = {
  id: string;
  type: UniverseType;
  /** Strength-weighted centroid, in the same world space as the nodes. */
  cx: number;
  cy: number;
  cz: number;
  /** World-space radius of the member cloud — drives the screen-size LOD test. */
  extent: number;
  count: number;
  /** Indices into the source `nodes` array — the full membership, nothing dropped. */
  members: number[];
  /** Brightest few members, drawn as sparse stars over the glow while collapsed. */
  reps: number[];
  /** Strongest member's label, shown as the cluster name in the far view. */
  label: string;
  /** 0..1 glow intensity from member density. */
  intensity: number;
};

export type ClusterTree = { clusters: NebulaCluster[] };

/** Below this node count the classic full-field render is fast enough — no LOD. */
export const LOD_ACTIVATION = 220;
/** Grid grows until the cluster count drops to roughly this many. */
const TARGET_MAX_CLUSTERS = 80;
const REPS_PER_CLUSTER = 4;
const INITIAL_CELL = 0.4;

/**
 * A cluster whose projected radius is smaller than this many pixels stays a
 * single glow; larger than the upper bound it fully expands into its member
 * nodes; between the two it cross-fades. Exported so the renderer and the tests
 * agree on the same band.
 */
export const LOD_EXPAND_MIN_PX = 46;
export const LOD_EXPAND_MAX_PX = 120;
/** Floor on the extent used for the LOD test so a tight (or single-node) cluster
 *  still expands once the camera is close, instead of staying a dot forever. */
export const LOD_MIN_EXTENT = 0.14;

/**
 * Expansion factor 0..1 for a cluster whose bounding sphere projects to
 * `screenExtentPx` on screen: 0 = draw the glow, 1 = draw the member nodes.
 */
export function clusterExpansion(screenExtentPx: number): number {
  if (screenExtentPx <= LOD_EXPAND_MIN_PX) return 0;
  if (screenExtentPx >= LOD_EXPAND_MAX_PX) return 1;
  return (screenExtentPx - LOD_EXPAND_MIN_PX) / (LOD_EXPAND_MAX_PX - LOD_EXPAND_MIN_PX);
}

export function buildClusterTree(nodes: UniverseNode[]): ClusterTree {
  if (nodes.length === 0) return { clusters: [] };

  // Bucket by (type, spatial cell), growing the cell until the cluster count is
  // manageable. Types stay apart so a cluster is always one semantic colour.
  let cells = new Map<string, number[]>();
  let cell = INITIAL_CELL;
  for (let pass = 0; pass < 6; pass++) {
    cells = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const key = `${n.type}:${Math.round(n.x / cell)}:${Math.round(n.y / cell)}:${Math.round(n.z / cell)}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(i);
      else cells.set(key, [i]);
    }
    if (cells.size <= TARGET_MAX_CLUSTERS) break;
    cell *= 1.5;
  }

  let maxCount = 1;
  for (const members of cells.values()) maxCount = Math.max(maxCount, members.length);

  const clusters: NebulaCluster[] = [];
  for (const [id, members] of cells) {
    let sx = 0, sy = 0, sz = 0, wsum = 0;
    for (const i of members) {
      const n = nodes[i];
      const w = n.strength + 0.05;
      sx += n.x * w; sy += n.y * w; sz += n.z * w; wsum += w;
    }
    const cx = sx / wsum, cy = sy / wsum, cz = sz / wsum;
    let extent = 0;
    for (const i of members) {
      const n = nodes[i];
      const d = Math.hypot(n.x - cx, n.y - cy, n.z - cz);
      if (d > extent) extent = d;
    }
    // Strongest-first so a budget-limited partial expansion materialises the
    // most important nodes, and reps are simply the top of that order.
    const sorted = [...members].sort((a, b) => nodes[b].strength - nodes[a].strength);
    const reps = sorted.slice(0, REPS_PER_CLUSTER);
    clusters.push({
      id,
      type: nodes[members[0]].type,
      cx, cy, cz,
      extent: Math.max(extent, 0.05),
      count: sorted.length,
      members: sorted,
      reps,
      label: nodes[reps[0]].label,
      // Denser buckets glow brighter, on a log curve so one huge cluster does not
      // wash the rest out.
      intensity: Math.max(0.3, Math.min(1, 0.34 + (Math.log(members.length + 1) / Math.log(maxCount + 1)) * 0.66)),
    });
  }
  return { clusters };
}

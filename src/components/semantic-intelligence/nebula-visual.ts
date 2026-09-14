/**
 * Pure visual + priority rules for the cognition universe.
 *
 * Kept apart from the client component so the node scale and the
 * overview→zoom evidence reveal can be unit-tested without a DOM. Nothing here
 * removes a node: the overview only fades the long tail, so every node stays
 * reachable in deep view and in raw space.
 */

/**
 * Continuous node radius — one sqrt curve of evidence strength, softly bounded.
 * There is no fixed top-N caste: size only ever encodes semantic gravity, and
 * two adjacent-strength nodes never jump across a size threshold.
 */
export function nodeVisualRadius(strength: number, projectionScale: number) {
  const value = 1.15 + Math.sqrt(Math.max(0, Math.min(1, strength))) * 4.85;
  return Math.max(0.9, Math.min(12, value * projectionScale * 1.15));
}

/**
 * How well the model's answers support a node, 0..1 — confidence-led, with
 * relationship pull and semantic gravity behind it. Decides which nodes lead
 * the zoomed-out overview.
 */
export function nodeEvidenceScore(node: { confidence: number; affinity: number; strength: number }) {
  const value = node.confidence * 0.5 + node.affinity * 0.35 + node.strength * 0.15;
  return Math.max(0, Math.min(1, value));
}

/**
 * Evidence floor for the current zoom. The zoomed-out overview keeps a high
 * floor so semantic regions and well-supported nodes lead; zooming in lowers it
 * toward 0 so the long tail re-emerges locally. `zoomLevel` is `2.6 / cam.dist`,
 * so the resting overview (~1.0) holds the full floor and a close dive (~5–6)
 * drops it to 0.
 */
export function overviewRevealFloor(zoomLevel: number) {
  return Math.max(0, Math.min(0.32, 0.32 - Math.max(0, zoomLevel - 1) * 0.13));
}

/**
 * Opacity multiplier for a node at a given zoom: full at or above the floor,
 * gently dimmed toward — but never to — zero below it. A faded long-tail node
 * is still drawn, still picked, and still present in raw space.
 */
export function overviewRevealAlpha(evidence: number, zoomLevel: number) {
  const floor = overviewRevealFloor(zoomLevel);
  if (floor <= 0 || evidence >= floor) return 1;
  return Math.max(0.2, evidence / floor);
}

/**
 * Far-view cluster drawing for the cognition universe.
 *
 * A collapsed cluster is drawn the same way the sector auras are — an additive
 * radial-gradient bloom under `globalCompositeOperation = "lighter"` — so the
 * nebula still reads as diffuse glow, not flat discs. The renderer keeps a small
 * per-hue sprite cache so a moving camera does not rebuild a gradient object for
 * every cluster on every frame.
 */
type RGB = readonly [number, number, number];

const spriteCache = new Map<string, HTMLCanvasElement>();
const SPRITE_SIZE = 128;

function glowSprite(hue: RGB): HTMLCanvasElement {
  const key = `${hue[0]},${hue[1]},${hue[2]}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const sprite = document.createElement("canvas");
  sprite.width = SPRITE_SIZE;
  sprite.height = SPRITE_SIZE;
  const sctx = sprite.getContext("2d");
  if (sctx) {
    const half = SPRITE_SIZE / 2;
    const gradient = sctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},0.9)`);
    gradient.addColorStop(0.35, `rgba(${hue[0]},${hue[1]},${hue[2]},0.35)`);
    gradient.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
    sctx.fillStyle = gradient;
    sctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  }
  spriteCache.set(key, sprite);
  return sprite;
}

/**
 * Draw one cluster's glow. `radius` is the on-screen bloom radius, `intensity`
 * folds in density and depth fog, `alpha` is the collapse cross-fade (1 when the
 * cluster is a pure glow, fading to 0 as its member nodes take over). Expects the
 * caller to already be in "lighter" mode.
 */
export function drawClusterGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hue: RGB,
  intensity: number,
  alpha: number,
): void {
  if (alpha <= 0 || radius <= 0.5) return;
  const sprite = glowSprite(hue);
  ctx.globalAlpha = Math.max(0, Math.min(1, intensity)) * Math.max(0, Math.min(1, alpha));
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
}

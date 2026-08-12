/**
 * Project high-dimensional embeddings down to 3D for the cognition universe.
 *
 * Deterministic PCA (top-3 principal components via power iteration with
 * deflation) — dep-free and pure so it is unit-testable. The subject entity is
 * translated to the origin, so a term's position reads directly as "where the
 * model places this meaning relative to the entity"; coordinates are scaled
 * into roughly [-1, 1] for the renderer.
 *
 * PCA is a faithful linear projection of the real vectors; a non-linear method
 * (UMAP/t-SNE) can replace `projectTo3D` later for tighter clusters without
 * changing callers.
 */

export type Vec = number[];

function mean(vectors: Vec[]): Vec {
  const d = vectors[0]?.length ?? 0;
  const m = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) m[i] += v[i] ?? 0;
  for (let i = 0; i < d; i++) m[i] /= vectors.length || 1;
  return m;
}

function centered(vectors: Vec[], m: Vec): Vec[] {
  return vectors.map((v) => v.map((x, i) => x - (m[i] ?? 0)));
}

function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(v: Vec): number {
  return Math.sqrt(dot(v, v));
}

/** Leading eigenvector of the covariance of `rows` via power iteration (seeded). */
function topComponent(rows: Vec[], d: number, seed: number): Vec {
  let v: Vec = new Array(d);
  let s = seed;
  for (let i = 0; i < d; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    v[i] = s / 0x7fffffff - 0.5;
  }
  let n = norm(v) || 1;
  v = v.map((x) => x / n);
  for (let iter = 0; iter < 60; iter++) {
    // w = Cov * v  =  Σ row (row·v)   (covariance without the 1/N constant)
    const w = new Array(d).fill(0);
    for (const row of rows) {
      const p = dot(row, v);
      for (let i = 0; i < d; i++) w[i] += row[i] * p;
    }
    n = norm(w);
    if (n < 1e-9) break;
    const nv = w.map((x) => x / n);
    let diff = 0;
    for (let i = 0; i < d; i++) diff += Math.abs(nv[i] - v[i]);
    v = nv;
    if (diff < 1e-7) break;
  }
  return v;
}

/** Remove the component direction from every row (deflation). */
function deflate(rows: Vec[], comp: Vec): void {
  for (const row of rows) {
    const p = dot(row, comp);
    for (let i = 0; i < row.length; i++) row[i] -= p * comp[i];
  }
}

/**
 * Project `vectors` to 3D. If `anchorIndex` is given, that point is moved to
 * the origin and everything else positioned relative to it.
 */
export function projectTo3D(vectors: Vec[], anchorIndex = -1): Array<{ x: number; y: number; z: number }> {
  const n = vectors.length;
  if (n === 0) return [];
  const d = vectors[0].length;
  if (d === 0) return vectors.map(() => ({ x: 0, y: 0, z: 0 }));
  if (n === 1) return [{ x: 0, y: 0, z: 0 }];

  const work = centered(vectors, mean(vectors));
  const comps: Vec[] = [];
  for (let c = 0; c < 3; c++) {
    const comp = topComponent(work, d, 7 + c * 101);
    comps.push(comp);
    deflate(work, comp);
  }

  // project the ORIGINAL centered vectors onto the 3 components
  const c0 = centered(vectors, mean(vectors));
  let coords = c0.map((row) => ({ x: dot(row, comps[0]), y: dot(row, comps[1]), z: dot(row, comps[2]) }));

  // anchor the subject at the origin
  if (anchorIndex >= 0 && anchorIndex < n) {
    const a = coords[anchorIndex];
    coords = coords.map((p) => ({ x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }));
  }

  // scale into ~[-1, 1]
  let max = 0;
  for (const p of coords) max = Math.max(max, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
  const s = max > 0 ? 1 / max : 1;
  return coords.map((p) => ({ x: p.x * s, y: p.y * s, z: p.z * s }));
}

/**
 * Causal & correlation statistics for the "proof layer".
 *
 * These are the functions that let CIP make two claims it otherwise cannot:
 *   1. that its AI-visibility metric tracks a real business outcome
 *      (correlation, with lag), and
 *   2. that an intervention — not model drift — caused a change in how AI
 *      answers, via a treatment/control difference-in-differences design.
 *
 * Everything here is pure and deterministic so it can be unit tested.
 */

export type Proportion = { successes: number; samples: number };

/** Arithmetic mean; 0 for an empty list. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Pearson product-moment correlation coefficient in [-1, 1].
 * Returns 0 when undefined (fewer than 2 points or zero variance).
 */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return 0;
  return clampRange(num / denom, -1, 1);
}

/** Average ranks (ties shared) — used by Spearman. */
function rank(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank for the tie group
    for (let k = i; k <= j; k += 1) ranks[indexed[k].index] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation — robust to non-linear monotonic relationships. */
export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  return pearson(rank(xs.slice(0, n)), rank(ys.slice(0, n)));
}

export type LaggedCorrelation = {
  bestLag: number;
  bestCorrelation: number;
  byLag: Array<{ lag: number; correlation: number }>;
};

/**
 * Correlate xs (e.g. AI-visibility) against ys (e.g. AI-referral sessions)
 * while shifting ys forward by `lag` days, to capture that cognition changes
 * tend to lead outcomes. Positive lag = outcome trails visibility.
 */
export function laggedCorrelation(xs: number[], ys: number[], maxLag = 7): LaggedCorrelation {
  const byLag: Array<{ lag: number; correlation: number }> = [];
  for (let lag = 0; lag <= maxLag; lag += 1) {
    const x = xs.slice(0, xs.length - lag);
    const y = ys.slice(lag);
    const correlation = pearson(x, y);
    byLag.push({ lag, correlation });
  }
  const best = byLag.reduce((acc, item) => (Math.abs(item.correlation) > Math.abs(acc.correlation) ? item : acc), byLag[0]);
  return { bestLag: best.lag, bestCorrelation: best.correlation, byLag };
}

/**
 * Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation.
 * Accurate to ~1e-7, plenty for reporting p-values.
 */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  const erf = sign * y;
  return 0.5 * (1 + erf);
}

/** Two-sided p-value for a z statistic. */
export function twoSidedPValue(z: number): number {
  return clampRange(2 * (1 - normalCdf(Math.abs(z))), 0, 1);
}

export type TwoProportionTest = {
  rate1: number;
  rate2: number;
  diff: number;
  z: number;
  pValue: number;
  significant: boolean;
};

/**
 * Unpooled two-proportion z-test for the difference rate2 - rate1.
 * `alpha` defaults to 0.05.
 */
export function twoProportionZTest(a: Proportion, b: Proportion, alpha = 0.05): TwoProportionTest {
  const rate1 = a.samples > 0 ? a.successes / a.samples : 0;
  const rate2 = b.samples > 0 ? b.successes / b.samples : 0;
  const diff = rate2 - rate1;
  const se = Math.sqrt(variancePropor(rate1, a.samples) + variancePropor(rate2, b.samples));
  const z = se === 0 ? 0 : diff / se;
  const pValue = twoSidedPValue(z);
  return { rate1, rate2, diff, z, pValue, significant: pValue < alpha };
}

export type DifferenceInDifferences = {
  treatmentPreRate: number;
  treatmentPostRate: number;
  controlPreRate: number;
  controlPostRate: number;
  treatmentDelta: number;
  /** The control delta is our estimate of model drift / seasonality. */
  controlDelta: number;
  /** Net lift attributable to the intervention, with drift removed. */
  netLift: number;
  z: number;
  pValue: number;
  significant: boolean;
};

/**
 * Difference-in-differences for proportions.
 *
 *   netLift = (treatmentPost - treatmentPre) - (controlPost - controlPre)
 *
 * The control arm absorbs model drift (the AI changed for everyone), so the
 * remainder is what the intervention actually moved. Significance uses the
 * combined standard error of the four independent proportions.
 */
export function differenceInDifferences(input: {
  treatmentPre: Proportion;
  treatmentPost: Proportion;
  controlPre: Proportion;
  controlPost: Proportion;
  alpha?: number;
}): DifferenceInDifferences {
  const alpha = input.alpha ?? 0.05;
  const tPre = rate(input.treatmentPre);
  const tPost = rate(input.treatmentPost);
  const cPre = rate(input.controlPre);
  const cPost = rate(input.controlPost);

  const treatmentDelta = tPost - tPre;
  const controlDelta = cPost - cPre;
  const netLift = treatmentDelta - controlDelta;

  const se = Math.sqrt(
    variancePropor(tPre, input.treatmentPre.samples) +
      variancePropor(tPost, input.treatmentPost.samples) +
      variancePropor(cPre, input.controlPre.samples) +
      variancePropor(cPost, input.controlPost.samples),
  );
  const z = se === 0 ? 0 : netLift / se;
  const pValue = twoSidedPValue(z);

  return {
    treatmentPreRate: tPre,
    treatmentPostRate: tPost,
    controlPreRate: cPre,
    controlPostRate: cPost,
    treatmentDelta,
    controlDelta,
    netLift,
    z,
    pValue,
    significant: pValue < alpha,
  };
}

function rate(p: Proportion): number {
  return p.samples > 0 ? p.successes / p.samples : 0;
}

function variancePropor(p: number, n: number): number {
  if (n <= 0) return 0;
  return (p * (1 - p)) / n;
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

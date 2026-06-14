export function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function wilsonInterval(successes: number, total: number, z = 1.96) {
  if (total <= 0) {
    return { estimate: 0, lowerBound: 0, upperBound: 0 };
  }

  const phat = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);

  return {
    estimate: clamp01(phat),
    lowerBound: clamp01((center - margin) / denominator),
    upperBound: clamp01((center + margin) / denominator),
  };
}

export function entropy(values: string[]) {
  if (values.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.values()).reduce((sum, count) => {
    const probability = count / values.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

export function variance(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

export function stabilityIndex(binaryObservations: boolean[]) {
  if (binaryObservations.length === 0) {
    return 0;
  }

  const rate =
    binaryObservations.filter(Boolean).length / binaryObservations.length;
  return clamp01(1 - Math.min(rate, 1 - rate) * 2);
}


const genericWords = new Set(["好", "不错", "产品", "品牌", "选择", "推荐", "适合", "一般"]);

const synonymMap = new Map<string, string>([
  ["coca-cola", "可口可乐"],
  ["coke", "可口可乐"],
  ["可乐", "可口可乐"],
  ["开心", "快乐"],
  ["愉快", "快乐"],
  ["糖分高", "高糖"],
  ["含糖量高", "高糖"],
]);

export function normalizeSignalValue(value: string, aliases: string[] = []) {
  const trimmed = value.trim();
  if (!trimmed || genericWords.has(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  for (const alias of aliases) {
    if (lower === alias.toLowerCase()) return aliases[0] || trimmed;
  }
  return synonymMap.get(lower) ?? synonymMap.get(trimmed) ?? trimmed;
}

export function uniqueNormalized(values: string[], aliases: string[] = []) {
  return Array.from(
    new Map(
      values
        .map((value) => [value, normalizeSignalValue(value, aliases)] as const)
        .filter((item): item is readonly [string, string] => Boolean(item[1]))
        .map(([raw, normalized]) => [normalized, { raw, normalized }]),
    ).values(),
  );
}

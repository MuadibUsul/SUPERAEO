const punctuationPattern = /[\u0000-\u001f"'`´‘’“”()[\]{}<>|\\,.;:!?，。！？、；：（）【】《》]/g;

export function normalizeTerm(term: string) {
  return term
    .normalize("NFKC")
    .replace(punctuationPattern, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isUsableTerm(term: string) {
  const normalized = normalizeTerm(term);
  if (!normalized) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (normalized.length < 2) return false;
  if (normalized.length > 80) return false;
  return true;
}

export function uniqueNormalizedTerms(terms: string[]) {
  return Array.from(new Map(terms.filter(isUsableTerm).map((term) => [normalizeTerm(term), term.trim()])).values());
}


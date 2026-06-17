export type ProjectWizardEntityType = "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT";

export function buildAuditNamePreview(input: {
  subjectName: string;
  fallbackSubject: string;
  language: string;
}) {
  const subject = input.subjectName.trim() || input.fallbackSubject;
  return input.language.toLowerCase().startsWith("zh")
    ? `${subject} AI 认知审计`
    : `${subject} AI Cognition Audit`;
}

export function getComparisonCategory(entityType: ProjectWizardEntityType) {
  if (entityType === "PERSON") return "peer_expert";
  if (entityType === "WEBSITE") return "alternative_source";
  if (entityType === "PRODUCT") return "substitute_product";
  return "direct";
}

/**
 * Detect the audit language from what the user typed, by script. Falls back to
 * the UI locale when there's nothing to go on yet (empty form).
 */
export function detectAuditLanguage(text: string, fallback: string = "en"): string {
  const value = text || "";
  // Check scripts unique to a language before the shared Han block.
  if (/[぀-ヿ]/u.test(value)) return "ja"; // hiragana / katakana (Japanese)
  if (/[가-힯]/u.test(value)) return "ko"; // hangul (Korean)
  if (/[一-鿿]/u.test(value)) return "zh-CN"; // Han ideographs
  if (/[Ѐ-ӿ]/u.test(value)) return "ru"; // cyrillic
  if (/[؀-ۿ]/u.test(value)) return "ar"; // arabic
  if (/[a-z]/i.test(value)) return "en";
  return fallback;
}

export function parseComparisonNames(input: string) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const rawName of input.split(/[,;\u3001\uFF0C\uFF1B\r\n]+/u)) {
    const name = rawName.trim();
    const key = name.toLowerCase();

    if (!name || seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}

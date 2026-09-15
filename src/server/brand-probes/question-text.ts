/**
 * A stored `AeoQuery.queryText` is the full probe PROMPT: the human question
 * followed by machine scaffolding — the unified output-field list, comparison
 * guidance and JSON schema instruction (see probe-templates.ts, which builds
 * `${corePrompt}\n\n${fieldsLine}\n…`). That scaffolding must never surface in
 * the UI as if it were the question. This trims it back to the readable question.
 */
const CUT_MARKERS = [
  "统一输出字段",
  "Output these fields",
  "只输出 json",
  "只输出json",
  "return only json",
  "only output json",
  "return json",
];

export function cleanQuestionText(raw: string | null | undefined): string {
  const text = (raw ?? "").replace(/\r/g, "");
  const lower = text.toLowerCase();
  let cut = text.length;
  for (const marker of CUT_MARKERS) {
    const index = lower.indexOf(marker.toLowerCase());
    if (index >= 0 && index < cut) cut = index;
  }
  const cleaned = text.slice(0, cut).trim();
  // If a marker sat at the very start (unexpected), keep the original rather than
  // rendering an empty question.
  return cleaned || text.trim();
}

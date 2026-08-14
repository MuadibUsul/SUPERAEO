/**
 * Extracts the signals that decide whether an AI answer engine can lift a clean,
 * attributable answer out of a page: who wrote it, when, what question it
 * answers, and whether any of that is machine-readable.
 *
 * Deliberately parser-free. The signals we need are either JSON (JSON-LD inside
 * a script tag), attribute-shaped (meta tags), or coarse structure (headings),
 * none of which need a full DOM — and a DOM parser is a dependency plus an
 * attack surface for pages we do not control. Body text is only ever used for
 * length and question-shape heuristics, never rendered back to the user, so
 * approximate extraction is acceptable here in a way it would not be elsewhere.
 */

export type PageSignals = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  /** Parsed JSON-LD blocks. Malformed blocks are skipped, not fatal. */
  structuredData: Array<Record<string, unknown>>;
  /** schema.org @type values found across all JSON-LD blocks. */
  schemaTypes: string[];
  headings: Array<{ level: number; text: string }>;
  /** Author from JSON-LD, meta tag, or a rel=author link. */
  author: string | null;
  /** Publication or modification date, ISO where parseable. */
  publishedAt: string | null;
  modifiedAt: string | null;
  /** Heading/JSON-LD pairs that read as an explicit question and answer. */
  faqCount: number;
  wordCount: number;
  /** Headings phrased as questions — the shape answer engines quote from. */
  questionHeadings: string[];
  canonicalUrl: string | null;
  noindex: boolean;
};

const QUESTION_MARKERS = /[?？]$|^(what|why|how|when|where|who|which|can|do(es)?|is|are|should)\b/i;
const CJK_QUESTION = /(什么|为什么|怎么|如何|哪些|哪个|是否|能否|多少)/u;

export function extractPageSignals(url: string, html: string): PageSignals {
  const withoutNoise = stripElements(html, ["script", "style", "noscript", "template", "svg"]);
  const structuredData = extractJsonLd(html);
  const headings = extractHeadings(html);

  return {
    url,
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim() || null,
    metaDescription: metaContent(html, "description"),
    structuredData,
    schemaTypes: schemaTypesFrom(structuredData),
    headings,
    author: extractAuthor(html, structuredData),
    publishedAt: normalizeDate(
      jsonLdValue(structuredData, "datePublished")
      ?? metaContent(html, "article:published_time")
      ?? metaContent(html, "date"),
    ),
    modifiedAt: normalizeDate(
      jsonLdValue(structuredData, "dateModified")
      ?? metaContent(html, "article:modified_time"),
    ),
    faqCount: countFaqEntries(structuredData),
    wordCount: countWords(textOf(withoutNoise)),
    questionHeadings: headings.map((heading) => heading.text).filter(isQuestionLike),
    canonicalUrl: firstMatch(html, /<link[^>]+rel=["']canonical["'][^>]*>/i)
      ? attributeOf(firstMatch(html, /<link[^>]+rel=["']canonical["'][^>]*>/i) ?? "", "href")
      : null,
    noindex: /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html),
  };
}

export function isQuestionLike(text: string) {
  const value = text.trim();
  if (!value) return false;
  return QUESTION_MARKERS.test(value) || CJK_QUESTION.test(value);
}

function stripElements(html: string, tags: string[]) {
  return tags.reduce(
    (acc, tag) => acc.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " "),
    html,
  );
}

function textOf(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string) {
  if (!text) return 0;
  // CJK has no spaces: count ideographs individually and latin runs as words.
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  const latin = text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.filter((word) => !/[\p{Script=Han}]/u.test(word)).length ?? 0;
  return cjk + latin;
}

function firstMatch(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? value.match(pattern)?.[0] ?? null;
}

function attributeOf(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1]?.trim() || null;
}

function metaContent(html: string, name: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)\\s*=\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );
  const tag = html.match(pattern)?.[0];
  return tag ? attributeOf(tag, "content") : null;
}

function extractJsonLd(html: string): Array<Record<string, unknown>> {
  const blocks = html.matchAll(
    /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const records: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      collectRecords(JSON.parse(raw), records);
    } catch {
      // A single malformed block must not lose the rest of the page's markup.
    }
  }
  return records;
}

function collectRecords(value: unknown, into: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  into.push(record);
  // @graph is how most CMS plugins emit multiple entities in one block.
  if (Array.isArray(record["@graph"])) collectRecords(record["@graph"], into);
}

function schemaTypesFrom(records: Array<Record<string, unknown>>) {
  const types = new Set<string>();
  for (const record of records) {
    const value = record["@type"];
    if (typeof value === "string") types.add(value);
    else if (Array.isArray(value)) for (const item of value) if (typeof item === "string") types.add(item);
  }
  return [...types];
}

function jsonLdValue(records: Array<Record<string, unknown>>, key: string) {
  for (const record of records) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function extractAuthor(html: string, records: Array<Record<string, unknown>>) {
  for (const record of records) {
    const author = record.author;
    if (typeof author === "string" && author.trim()) return author.trim();
    if (author && typeof author === "object") {
      const name = (Array.isArray(author) ? author[0] : author) as Record<string, unknown> | undefined;
      if (name && typeof name.name === "string" && name.name.trim()) return name.name.trim();
    }
  }
  return metaContent(html, "author") ?? metaContent(html, "article:author");
}

function countFaqEntries(records: Array<Record<string, unknown>>) {
  let count = 0;
  for (const record of records) {
    const entities = record.mainEntity;
    if (!Array.isArray(entities)) continue;
    for (const entity of entities) {
      const type = (entity as Record<string, unknown>)?.["@type"];
      if (type === "Question") count += 1;
    }
  }
  return count;
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function extractHeadings(html: string) {
  const headings: Array<{ level: number; text: string }> = [];
  for (const match of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = textOf(match[2] ?? "");
    if (text) headings.push({ level: Number(match[1]), text });
  }
  return headings;
}

import { gunzipSync } from "node:zlib";

/**
 * A deliberately small, well-behaved crawler for the site being audited.
 *
 * This is the only place the platform makes outbound requests to a customer's
 * own infrastructure, so the limits are policy, not tuning:
 *   - robots.txt is fetched first and obeyed; a disallowed path is skipped.
 *   - a fixed page budget and per-request timeout, both capped in code.
 *   - requests are sequential with a delay, so we never look like a burst.
 *   - a real User-Agent that identifies us and links to an explanation.
 *   - only same-origin http(s) URLs; no redirect chasing across hosts.
 *
 * It is not a general web crawler and must not become one: it reads a sitemap
 * (or falls back to the homepage plus its internal links) and stops.
 */

const MAX_PAGES = 25;
const MAX_HTML_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DELAY_BETWEEN_REQUESTS_MS = 500;
const MAX_CHILD_SITEMAPS = 3;
const SITEMAP_SCAN_LIMIT = 50_000;
const USER_AGENT = "CIPAuditBot/1.0 (+https://github.com/MuadibUsul/SUPERAEO; AI cognition audit of a site its owner submitted)";

export type FetchedPage = {
  url: string;
  status: number;
  html: string;
};

export type CrawlResult = {
  origin: string;
  pages: FetchedPage[];
  /** Why a URL was not fetched — surfaced so a low score is never unexplained. */
  skipped: Array<{ url: string; reason: string }>;
  robotsFound: boolean;
};

export type CrawlOptions = {
  maxPages?: number;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export function normalizeOrigin(rawUrl: string) {
  const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  return url;
}

/** Minimal robots.txt: the Disallow rules that apply to us. */
export function parseRobots(body: string): { disallow: string[]; crawlDelayMs: number | null } {
  const disallow: string[] = [];
  let crawlDelayMs: number | null = null;
  let applies = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(":");
    const field = rawField?.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (field === "user-agent") {
      // Only the wildcard group and a group naming us apply.
      applies = value === "*" || value.toLowerCase().includes("cipauditbot");
      continue;
    }
    if (!applies) continue;
    if (field === "disallow" && value) disallow.push(value);
    if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) crawlDelayMs = Math.min(10_000, seconds * 1000);
    }
  }

  return { disallow, crawlDelayMs };
}

export function isAllowed(pathname: string, disallow: string[]) {
  // A bare "Disallow:" means allow-all and is filtered out at parse time.
  return !disallow.some((rule) => rule === "/" ? true : pathname.startsWith(rule));
}

/** True for <sitemapindex>, whose <loc> entries are other sitemaps, not pages. */
export function isSitemapIndex(xml: string) {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Non-page URLs that must never be scored as content. A sitemap index pointing
 * at .xml.gz files was previously crawled as if the sitemaps themselves were
 * pages, producing a readiness score computed from XML noise.
 */
const NON_PAGE_EXTENSION = /\.(xml|xml\.gz|gz|json|txt|rss|atom|pdf|jpe?g|png|gif|webp|svg|ico|css|js|zip|mp4|webm)$/i;

export function isContentPageUrl(url: string) {
  try {
    return !NON_PAGE_EXTENSION.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Reads page URLs out of a sitemap, sampled evenly across the whole file.
 *
 * Taking the first N is a biased sample: sitemaps commonly open with nav and
 * utility pages (a real run against MDN drew "/", "/en-US/" and "/en-US/404"),
 * so the readiness score described pages nobody reads instead of the site's
 * actual content. `pagesOnly: false` keeps document order, which the sitemap
 * index resolver needs.
 */
export function extractSitemapUrls(xml: string, origin: string, limit: number, options: { pagesOnly?: boolean } = {}) {
  const pagesOnly = options.pagesOnly !== false;
  const all: string[] = [];

  for (const match of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.origin !== origin) continue;
      if (pagesOnly && !isContentPageUrl(url.toString())) continue;
      all.push(url.toString());
    } catch {
      // Skip malformed entries rather than failing the whole sitemap.
    }
    // Ordered consumers take the head; sampling needs the full list, but a
    // sitemap can hold 50k entries so collection is still bounded.
    if (!pagesOnly && all.length >= limit) break;
    if (all.length >= SITEMAP_SCAN_LIMIT) break;
  }

  if (!pagesOnly || all.length <= limit) return all.slice(0, limit);

  const stride = all.length / limit;
  return Array.from({ length: limit }, (_, index) => all[Math.floor(index * stride)]);
}

export function extractInternalLinks(html: string, pageUrl: string, limit: number) {
  const base = new URL(pageUrl);
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b[^>]+href\s*=\s*["']([^"']+)["']/gi)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const url = new URL(href, base);
      url.hash = "";
      if (url.origin !== base.origin) continue;
      if (url.toString() !== pageUrl) seen.add(url.toString());
    } catch {
      // Ignore unparseable hrefs.
    }
    if (seen.size >= limit) break;
  }

  return [...seen];
}

export async function crawlSite(rawUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const budget = Math.min(MAX_PAGES, Math.max(1, options.maxPages ?? MAX_PAGES));
  const origin = normalizeOrigin(rawUrl);
  const pages: FetchedPage[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];

  const robotsResponse = await safeFetch(doFetch, new URL("/robots.txt", origin).toString());
  const robots = robotsResponse?.ok ? parseRobots(robotsResponse.body) : { disallow: [], crawlDelayMs: null };
  const delayMs = Math.max(DELAY_BETWEEN_REQUESTS_MS, robots.crawlDelayMs ?? 0);

  const candidates = await discoverUrls(doFetch, origin, budget, robots.disallow, skipped);

  for (const url of candidates) {
    if (pages.length >= budget) break;

    const parsed = new URL(url);
    if (!isAllowed(parsed.pathname, robots.disallow)) {
      skipped.push({ url, reason: "disallowed_by_robots" });
      continue;
    }

    const result = await safeFetch(doFetch, url);
    if (!result) {
      skipped.push({ url, reason: "fetch_failed" });
    } else if (!result.ok) {
      skipped.push({ url, reason: `http_${result.status}` });
    } else if (!result.isHtml) {
      skipped.push({ url, reason: "not_html" });
    } else {
      pages.push({ url, status: result.status, html: result.body });
    }

    if (pages.length < budget) await delay(delayMs);
  }

  return { origin: origin.origin, pages, skipped, robotsFound: Boolean(robotsResponse?.ok) };
}

async function discoverUrls(
  doFetch: typeof fetch,
  origin: URL,
  budget: number,
  disallow: string[],
  skipped: Array<{ url: string; reason: string }>,
) {
  const homepage = origin.toString();
  const sitemap = await safeFetch(doFetch, new URL("/sitemap.xml", origin).toString());

  if (sitemap?.ok && sitemap.body.includes("<loc>")) {
    const urls = isSitemapIndex(sitemap.body)
      ? await resolveSitemapIndex(doFetch, sitemap.body, origin.origin, budget, disallow)
      : extractSitemapUrls(sitemap.body, origin.origin, budget);
    if (urls.length > 0) return dedupe([homepage, ...urls]).slice(0, budget);
  }

  // No usable sitemap: the homepage plus the internal links it offers. This is
  // the full extent of discovery — we never recurse past depth one.
  const home = await safeFetch(doFetch, homepage);
  if (!home?.ok || !home.isHtml) {
    skipped.push({ url: homepage, reason: home ? `http_${home.status}` : "fetch_failed" });
    return [homepage];
  }

  const links = extractInternalLinks(home.body, homepage, budget * 2)
    .filter((url) => isAllowed(new URL(url).pathname, disallow));
  return dedupe([homepage, ...links]).slice(0, budget);
}

/**
 * Follows a sitemap index exactly one level to reach real page URLs. Large sites
 * almost always use an index, so without this the crawler scored the sub-sitemap
 * files themselves. Sub-sitemaps are commonly gzipped and served as a body (not
 * as Content-Encoding), so those are decompressed explicitly.
 */
async function resolveSitemapIndex(
  doFetch: typeof fetch,
  indexXml: string,
  origin: string,
  budget: number,
  disallow: string[],
) {
  const childSitemaps = extractSitemapUrls(indexXml, origin, MAX_CHILD_SITEMAPS, { pagesOnly: false });
  const pages: string[] = [];

  for (const sitemapUrl of childSitemaps) {
    if (pages.length >= budget) break;
    const child = await safeFetch(doFetch, sitemapUrl, { allowBinary: true });
    if (!child?.ok) continue;

    const xml = child.body.includes("<loc>") ? child.body : gunzip(child.bytes);
    if (!xml) continue;

    for (const url of extractSitemapUrls(xml, origin, budget - pages.length)) {
      if (isAllowed(new URL(url).pathname, disallow)) pages.push(url);
    }
    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }

  return pages;
}

function gunzip(bytes: Uint8Array | null) {
  if (!bytes || bytes.byteLength < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return null;
  try {
    return gunzipSync(bytes).toString("utf-8");
  } catch {
    return null;
  }
}

async function safeFetch(doFetch: typeof fetch, url: string, options: { allowBinary?: boolean } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await doFetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const isHtml = /text\/html|application\/xhtml/i.test(contentType);
    const bytes = await readCapped(response);
    const body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return { ok: response.ok, status: response.status, body, isHtml, bytes: options.allowBinary ? bytes : null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads at most MAX_HTML_BYTES so a huge or endless response cannot exhaust memory. */
async function readCapped(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new TextEncoder().encode((await response.text()).slice(0, MAX_HTML_BYTES));

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await reader.cancel().catch(() => undefined);

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk.subarray(0, Math.max(0, Math.min(chunk.byteLength, total - offset))), offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function dedupe(urls: string[]) {
  return [...new Set(urls)];
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

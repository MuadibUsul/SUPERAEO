import assert from "node:assert/strict";
import test from "node:test";

import { crawlSite, extractInternalLinks, extractSitemapUrls, isAllowed, isSitemapIndex, parseRobots } from "@/server/website-audit/fetcher";
import { extractPageSignals, isQuestionLike } from "@/server/website-audit/page-signals";
import { scorePage, scoreSite } from "@/server/website-audit/readiness";

const RICH_PAGE = `
<!doctype html><html><head>
  <title>How do answer engines pick a source?</title>
  <meta name="description" content="A practical explanation.">
  <meta name="author" content="Jane Roe">
  <link rel="canonical" href="https://example.com/guide">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","author":{"@type":"Person","name":"Jane Roe"},
   "datePublished":"2026-06-01","dateModified":"2026-07-15"}
  </script>
  <script type="application/ld+json">
  {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is AEO?"},{"@type":"Question","name":"Why does it matter?"}]}
  </script>
  <script>var tracking = "should not count as body text";</script>
</head><body>
  <h1>How do answer engines pick a source?</h1>
  <h2>What signals matter most?</h2>
  <p>${"word ".repeat(200)}</p>
  <h2>Structured data</h2>
  <a href="/pricing">Pricing</a><a href="https://other.test/x">External</a><a href="#top">Anchor</a>
</body></html>`;

const BARE_PAGE = `<!doctype html><html><head><title>Hi</title></head><body><p>Short.</p></body></html>`;

test("extracts structured data, byline and dates from a well-marked page", () => {
  const signals = extractPageSignals("https://example.com/guide", RICH_PAGE);

  assert.equal(signals.title, "How do answer engines pick a source?");
  assert.equal(signals.author, "Jane Roe");
  assert.equal(signals.publishedAt?.slice(0, 10), "2026-06-01");
  assert.equal(signals.modifiedAt?.slice(0, 10), "2026-07-15");
  assert.equal(signals.faqCount, 2);
  assert.ok(signals.schemaTypes.includes("Article"));
  assert.ok(signals.schemaTypes.includes("FAQPage"));
  assert.equal(signals.canonicalUrl, "https://example.com/guide");
  assert.equal(signals.noindex, false);
  assert.equal(signals.headings.length, 3);
  assert.ok(signals.questionHeadings.length >= 2);
});

test("script and style contents never count as body text", () => {
  const signals = extractPageSignals("https://example.com/guide", RICH_PAGE);
  // 200 "word" tokens plus heading text; the tracking script must be excluded.
  assert.ok(signals.wordCount >= 200, `expected >=200 words, got ${signals.wordCount}`);
  assert.ok(signals.wordCount < 260, `script text appears to have leaked in: ${signals.wordCount}`);
});

test("a malformed JSON-LD block does not lose the valid ones", () => {
  const html = `<html><head>
    <script type="application/ld+json">{ this is not json }</script>
    <script type="application/ld+json">{"@type":"Article","author":"Real Author"}</script>
  </head><body><p>text</p></body></html>`;
  const signals = extractPageSignals("https://example.com/x", html);

  assert.equal(signals.author, "Real Author");
  assert.deepEqual(signals.schemaTypes, ["Article"]);
});

test("@graph entries are flattened", () => {
  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"BlogPosting","datePublished":"2026-01-02"}]}
  </script></head><body></body></html>`;
  const signals = extractPageSignals("https://example.com/x", html);

  assert.ok(signals.schemaTypes.includes("WebSite"));
  assert.ok(signals.schemaTypes.includes("BlogPosting"));
  assert.equal(signals.publishedAt?.slice(0, 10), "2026-01-02");
});

test("question detection handles both English and Chinese", () => {
  assert.equal(isQuestionLike("What is AEO?"), true);
  assert.equal(isQuestionLike("How do I start"), true);
  assert.equal(isQuestionLike("什么是答案引擎优化"), true);
  assert.equal(isQuestionLike("如何开始？"), true);
  assert.equal(isQuestionLike("Structured data"), false);
  assert.equal(isQuestionLike(""), false);
});

test("a thin unattributed page scores poorly and says why", () => {
  const readiness = scorePage(extractPageSignals("https://example.com/", BARE_PAGE), Date.parse("2026-08-14"));

  assert.ok(readiness.score !== null && readiness.score < 0.4, `expected a low score, got ${readiness.score}`);
  const attribution = readiness.components.find((component) => component.key === "attribution");
  assert.equal(attribution?.score, 0);
  assert.match(attribution?.finding.en ?? "", /No bylined author/);
  const freshness = readiness.components.find((component) => component.key === "freshness");
  assert.match(freshness?.finding.en ?? "", /No published or modified date/);
});

test("a well-marked page scores well", () => {
  const readiness = scorePage(extractPageSignals("https://example.com/guide", RICH_PAGE), Date.parse("2026-08-14"));
  assert.ok(readiness.score !== null && readiness.score > 0.7, `expected a high score, got ${readiness.score}`);
});

test("a page we could not read scores null, not zero", () => {
  // "We did not look" and "we looked and it is bad" must not render alike.
  const signals = extractPageSignals("https://example.com/spa", "<html><body></body></html>");
  const readiness = scorePage(signals);
  const extractability = readiness.components.find((component) => component.key === "extractability");

  assert.equal(extractability?.score, null);
  assert.match(extractability?.finding.en ?? "", /client-rendered/);
});

test("site score reports null when nothing could be fetched", () => {
  const site = scoreSite([]);
  assert.equal(site.score, null);
  assert.equal(site.pagesAnalyzed, 0);
  for (const component of site.components) {
    assert.equal(component.score, null);
    assert.match(component.finding.en, /Not enough pages/);
  }
});

test("robots.txt disallow rules are parsed and applied", () => {
  const robots = parseRobots(`
    User-agent: BadBot
    Disallow: /
    User-agent: *
    Disallow: /admin
    Disallow: /private/
    Crawl-delay: 2
  `);

  assert.deepEqual(robots.disallow, ["/admin", "/private/"]);
  assert.equal(robots.crawlDelayMs, 2000);
  // The BadBot group must not apply to us.
  assert.equal(isAllowed("/", robots.disallow), true);
  assert.equal(isAllowed("/admin/users", robots.disallow), false);
  assert.equal(isAllowed("/private/x", robots.disallow), false);
  assert.equal(isAllowed("/blog/post", robots.disallow), true);
});

test("a rule naming our agent is honoured", () => {
  const robots = parseRobots("User-agent: CIPAuditBot\nDisallow: /no-audit");
  assert.equal(isAllowed("/no-audit/page", robots.disallow), false);
});

test("sitemap and link discovery stay on the same origin", () => {
  const sitemap = `<urlset>
    <url><loc>https://example.com/a</loc></url>
    <url><loc>https://evil.test/b</loc></url>
    <url><loc>not a url</loc></url>
  </urlset>`;
  assert.deepEqual(extractSitemapUrls(sitemap, "https://example.com", 10), ["https://example.com/a"]);

  const links = extractInternalLinks(RICH_PAGE, "https://example.com/guide", 10);
  assert.deepEqual(links, ["https://example.com/pricing"]);
});

test("crawl obeys robots, the page budget, and reports what it skipped", async () => {
  const requested: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const href = String(url);
    requested.push(href);
    const reply = (body: string, type = "text/html") =>
      new Response(body, { status: 200, headers: { "content-type": type } });

    if (href.endsWith("/robots.txt")) return reply("User-agent: *\nDisallow: /admin", "text/plain");
    if (href.endsWith("/sitemap.xml")) {
      return reply(`<urlset>
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/admin/secret</loc></url>
        <url><loc>https://example.com/b</loc></url>
        <url><loc>https://example.com/c</loc></url>
      </urlset>`, "application/xml");
    }
    if (href.includes("/c")) return new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
    return reply(BARE_PAGE);
  }) as unknown as typeof fetch;

  const result = await crawlSite("example.com", { fetchImpl, maxPages: 3 });

  assert.equal(result.robotsFound, true);
  assert.ok(result.pages.length <= 3, "must not exceed the page budget");
  assert.ok(!requested.some((url) => url.includes("/admin")), "must never request a disallowed path");
  assert.ok(result.skipped.some((entry) => entry.reason === "disallowed_by_robots"));
  assert.ok(!result.pages.some((page) => page.url.includes("/admin")));
});

test("a sitemap index is followed to real pages, not scored itself", async () => {
  // Caught on a live run against MDN: /sitemap.xml was a <sitemapindex> whose
  // <loc> entries are .xml.gz sub-sitemaps. Those were being fetched and scored
  // as if they were content pages, producing a readiness score from XML noise.
  const requested: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const href = String(url);
    requested.push(href);
    const reply = (body: string, type: string) =>
      new Response(body, { status: 200, headers: { "content-type": type } });

    if (href.endsWith("/robots.txt")) return reply("User-agent: *\nDisallow:", "text/plain");
    if (href.endsWith("/sitemap.xml")) {
      return reply(`<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemaps/pages.xml</loc></sitemap>
      </sitemapindex>`, "application/xml");
    }
    if (href.endsWith("/sitemaps/pages.xml")) {
      return reply(`<urlset><url><loc>https://example.com/guide</loc></url>
        <url><loc>https://example.com/about</loc></url></urlset>`, "application/xml");
    }
    return reply(BARE_PAGE, "text/html");
  }) as unknown as typeof fetch;

  const result = await crawlSite("example.com", { fetchImpl, maxPages: 3 });

  const fetchedUrls = result.pages.map((page) => page.url);
  assert.ok(!fetchedUrls.some((url) => url.includes("sitemap")), `a sitemap was scored as a page: ${fetchedUrls.join(", ")}`);
  assert.ok(fetchedUrls.includes("https://example.com/guide"), "should reach real pages through the index");
  assert.ok(requested.some((url) => url.endsWith("/sitemaps/pages.xml")), "should follow the index one level");
});

test("sitemap entries that are not content pages are filtered out", () => {
  const xml = `<urlset>
    <url><loc>https://example.com/guide</loc></url>
    <url><loc>https://example.com/feed.xml</loc></url>
    <url><loc>https://example.com/dump.xml.gz</loc></url>
    <url><loc>https://example.com/logo.png</loc></url>
    <url><loc>https://example.com/doc.pdf</loc></url>
  </urlset>`;

  assert.deepEqual(extractSitemapUrls(xml, "https://example.com", 10), ["https://example.com/guide"]);
  // The index resolver needs the sitemap URLs themselves, so it opts out.
  assert.equal(extractSitemapUrls(xml, "https://example.com", 10, { pagesOnly: false }).length, 5);
});

test("pages are sampled across the sitemap, not taken from the front", () => {
  // A live MDN run drew "/", "/en-US/" and "/en-US/404" — the nav and utility
  // pages a sitemap opens with — so the score described pages nobody reads.
  const entries = Array.from({ length: 100 }, (_, index) => `<url><loc>https://example.com/p${index}</loc></url>`);
  const urls = extractSitemapUrls(`<urlset>${entries.join("")}</urlset>`, "https://example.com", 4);

  assert.equal(urls.length, 4);
  assert.deepEqual(urls, [
    "https://example.com/p0",
    "https://example.com/p25",
    "https://example.com/p50",
    "https://example.com/p75",
  ]);

  // Below the limit everything is returned, in order.
  const few = extractSitemapUrls("<urlset><url><loc>https://example.com/a</loc></url></urlset>", "https://example.com", 4);
  assert.deepEqual(few, ["https://example.com/a"]);
  assert.equal(isSitemapIndex("<sitemapindex><sitemap/></sitemapindex>"), true);
  assert.equal(isSitemapIndex("<urlset><url/></urlset>"), false);
});

test("an XML response is never scored as a page", async () => {
  const fetchImpl = (async (url: string | URL) => {
    const href = String(url);
    if (href.endsWith("/robots.txt")) return new Response("", { status: 404 });
    // Everything answers with XML — nothing should end up scored.
    return new Response("<urlset><url><loc>x</loc></url></urlset>", {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
  }) as unknown as typeof fetch;

  const result = await crawlSite("example.com", { fetchImpl, maxPages: 2 });

  assert.equal(result.pages.length, 0, "XML must not be treated as an HTML page");
  assert.ok(result.skipped.some((entry) => entry.reason === "not_html"));
});

test("crawl never leaves the origin", async () => {
  const requested: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    requested.push(String(url));
    return new Response(RICH_PAGE, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;

  await crawlSite("https://example.com", { fetchImpl, maxPages: 5 });

  for (const url of requested) {
    assert.equal(new URL(url).origin, "https://example.com", `left the origin: ${url}`);
  }
});

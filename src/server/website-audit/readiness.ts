import type { PageSignals } from "@/server/website-audit/page-signals";

/**
 * Turns page signals into the two site-side metrics a website audit claims:
 * whether an answer engine can lift a clean answer out of a page, and whether
 * it has any reason to attribute that answer to you.
 *
 * Every component states what it measured. A page we could not fetch produces
 * no score at all rather than a zero — "we did not look" and "we looked and it
 * is bad" must not render as the same number.
 */

export type ReadinessComponent = {
  key: "extractability" | "attribution" | "freshness" | "structure" | "question_coverage";
  /** 0..1, or null when the evidence to judge it is missing. */
  score: number | null;
  /** What was actually observed, for the report. */
  finding: { zh: string; en: string };
};

export type PageReadiness = {
  url: string;
  components: ReadinessComponent[];
  /** Mean of the components that could be scored, or null if none could. */
  score: number | null;
};

export type SiteReadiness = {
  pagesAnalyzed: number;
  score: number | null;
  components: ReadinessComponent[];
  pages: PageReadiness[];
};

const AUTHORITY_SCHEMA = new Set([
  "Article", "NewsArticle", "BlogPosting", "TechArticle", "ScholarlyArticle",
  "FAQPage", "HowTo", "QAPage", "Dataset", "Report",
]);

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function scorePage(signals: PageSignals, now = Date.now()): PageReadiness {
  const components: ReadinessComponent[] = [
    extractability(signals),
    attribution(signals),
    freshness(signals, now),
    structure(signals),
    questionCoverage(signals),
  ];

  return { url: signals.url, components, score: meanScore(components) };
}

export function scoreSite(pages: PageReadiness[]): SiteReadiness {
  const keys: ReadinessComponent["key"][] = [
    "extractability", "attribution", "freshness", "structure", "question_coverage",
  ];

  const components = keys.map((key) => {
    const scored = pages
      .map((page) => page.components.find((component) => component.key === key))
      .filter((component): component is ReadinessComponent => Boolean(component) && component!.score !== null);

    if (scored.length === 0) {
      return {
        key,
        score: null,
        finding: {
          zh: "没有成功抓取到足够页面，无法评估。",
          en: "Not enough pages were fetched to assess this.",
        },
      } satisfies ReadinessComponent;
    }

    const mean = scored.reduce((total, component) => total + (component.score ?? 0), 0) / scored.length;
    const weakest = scored.reduce((a, b) => ((a.score ?? 1) <= (b.score ?? 1) ? a : b));
    return { key, score: mean, finding: weakest.finding } satisfies ReadinessComponent;
  });

  return {
    pagesAnalyzed: pages.length,
    score: meanScore(components),
    components,
    pages,
  };
}

function meanScore(components: ReadinessComponent[]) {
  const scored = components.filter((component) => component.score !== null);
  if (scored.length === 0) return null;
  return scored.reduce((total, component) => total + (component.score ?? 0), 0) / scored.length;
}

/** Can a model find a self-contained answer, or is the page too thin/too vast? */
function extractability(signals: PageSignals): ReadinessComponent {
  if (signals.wordCount === 0) {
    return {
      key: "extractability",
      score: null,
      finding: { zh: "页面没有可提取的正文（可能依赖客户端渲染）。", en: "No extractable body text (the page may be client-rendered)." },
    };
  }

  // Too short and there is nothing to quote; extremely long and the answer is
  // buried. Headings are what let a model find the relevant span.
  const lengthScore = signals.wordCount < 150 ? signals.wordCount / 150 : signals.wordCount > 6000 ? 0.6 : 1;
  const headingScore = signals.headings.length === 0 ? 0.3 : clamp(signals.headings.length / 6);
  const score = clamp(lengthScore * 0.5 + headingScore * 0.5);

  return {
    key: "extractability",
    score,
    finding: signals.wordCount < 150
      ? { zh: `正文仅约 ${signals.wordCount} 词，内容过薄，难以被引用。`, en: `Only ~${signals.wordCount} words of body text — too thin to be quoted.` }
      : signals.headings.length === 0
        ? { zh: "页面没有小标题，模型难以定位到具体答案段落。", en: "No headings, so a model cannot locate the answering passage." }
        : { zh: `正文约 ${signals.wordCount} 词，有 ${signals.headings.length} 个小标题。`, en: `~${signals.wordCount} words across ${signals.headings.length} headings.` },
  };
}

/** Is there anyone to credit? An unattributed page is a weak citation target. */
function attribution(signals: PageSignals): ReadinessComponent {
  const hasAuthor = Boolean(signals.author);
  const hasPublisher = signals.schemaTypes.some((type) => type === "Organization" || type === "Person");
  const score = clamp((hasAuthor ? 0.7 : 0) + (hasPublisher ? 0.3 : 0));

  return {
    key: "attribution",
    score,
    finding: hasAuthor
      ? { zh: `署名作者：${signals.author}。`, en: `Bylined author: ${signals.author}.` }
      : { zh: "页面没有署名作者，降低了被当作可信来源引用的可能。", en: "No bylined author, which weakens it as a citable source." },
  };
}

/** Stale pages lose to fresher sources on anything time-sensitive. */
function freshness(signals: PageSignals, now: number): ReadinessComponent {
  const stamp = signals.modifiedAt ?? signals.publishedAt;
  if (!stamp) {
    return {
      key: "freshness",
      score: 0,
      finding: { zh: "页面没有发布或更新时间，模型无法判断内容是否过时。", en: "No published or modified date, so a model cannot tell whether it is current." },
    };
  }

  const ageDays = Math.max(0, (now - Date.parse(stamp)) / 86_400_000);
  const score = ageDays <= 180 ? 1 : ageDays <= 365 ? 0.8 : ageDays <= 730 ? 0.5 : 0.25;

  return {
    key: "freshness",
    score,
    finding: {
      zh: `最后更新于 ${stamp.slice(0, 10)}（约 ${Math.round(ageDays)} 天前）。`,
      en: `Last updated ${stamp.slice(0, 10)} (~${Math.round(ageDays)} days ago).`,
    },
  };
}

/** Machine-readable markup is what makes a page quotable with attribution. */
function structure(signals: PageSignals): ReadinessComponent {
  const hasJsonLd = signals.structuredData.length > 0;
  const hasAuthorityType = signals.schemaTypes.some((type) => AUTHORITY_SCHEMA.has(type));
  const score = clamp((hasJsonLd ? 0.5 : 0) + (hasAuthorityType ? 0.5 : 0));

  return {
    key: "structure",
    score,
    finding: hasJsonLd
      ? { zh: `结构化数据类型：${signals.schemaTypes.join(", ") || "未声明 @type"}。`, en: `Structured data types: ${signals.schemaTypes.join(", ") || "no @type declared"}.` }
      : { zh: "页面没有 JSON-LD 结构化数据。", en: "No JSON-LD structured data on the page." },
  };
}

/** Does the page explicitly answer questions, in the shape answers get lifted? */
function questionCoverage(signals: PageSignals): ReadinessComponent {
  const explicit = signals.faqCount;
  const implicit = signals.questionHeadings.length;
  const score = clamp((explicit > 0 ? 0.6 : 0) + Math.min(0.4, implicit * 0.1));

  return {
    key: "question_coverage",
    score,
    finding: explicit > 0 || implicit > 0
      ? { zh: `${explicit} 条 FAQ 标记，${implicit} 个问句式小标题。`, en: `${explicit} marked-up FAQ entries and ${implicit} question-shaped headings.` }
      : { zh: "页面没有以问题形式组织内容，不易被直接引用为答案。", en: "Content is not organized as questions, so it is harder to lift as an answer." },
  };
}

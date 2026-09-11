import { crawlSite } from "@/server/website-audit/fetcher";
import { extractPageSignals } from "@/server/website-audit/page-signals";
import { scorePage, scoreSite, type SiteReadiness } from "@/server/website-audit/readiness";
import { recordTraceEvent } from "@/server/observability/event-log";

export type SiteReadinessResult =
  | { status: "ok"; readiness: SiteReadiness; robotsFound: boolean; skipped: Array<{ url: string; reason: string }> }
  | { status: "disabled"; reason: string }
  | { status: "not_applicable"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Crawling a customer's site is opt-in per deployment. It is the only outbound
 * traffic we send to infrastructure we do not own, so an operator has to turn
 * it on deliberately rather than inherit it from a default.
 */
export function isSiteCrawlEnabled() {
  return process.env.WEBSITE_CRAWL_ENABLED === "true";
}

export async function analyzeSiteReadiness(input: {
  projectId: string;
  entityType: string;
  websiteUrl: string | null | undefined;
  maxPages?: number;
}): Promise<SiteReadinessResult> {
  // Site-side readiness only means something for a website audit. A brand's
  // homepage says nothing about whether the brand gets recommended.
  if (input.entityType !== "WEBSITE") {
    return { status: "not_applicable", reason: "Site readiness is only measured for website audits." };
  }
  if (!isSiteCrawlEnabled()) {
    return { status: "disabled", reason: "Set WEBSITE_CRAWL_ENABLED=true to measure on-site answer readiness." };
  }
  if (!input.websiteUrl?.trim()) {
    return { status: "not_applicable", reason: "The project has no website URL." };
  }

  try {
    const crawl = await crawlSite(input.websiteUrl, { maxPages: input.maxPages });
    const readiness = scoreSite(crawl.pages.map((page) => scorePage(extractPageSignals(page.url, page.html))));

    await recordTraceEvent({
      severity: crawl.pages.length === 0 ? "warn" : "info",
      eventType: "website.crawl.completed",
      subsystem: "website_audit",
      operation: "site_readiness",
      status: crawl.pages.length === 0 ? "failed" : "succeeded",
      projectId: input.projectId,
      metadata: {
        origin: crawl.origin,
        pagesAnalyzed: crawl.pages.length,
        skippedCount: crawl.skipped.length,
        robotsFound: crawl.robotsFound,
      },
    });

    return { status: "ok", readiness, robotsFound: crawl.robotsFound, skipped: crawl.skipped };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Site crawl failed.";
    await recordTraceEvent({
      severity: "error",
      eventType: "website.crawl.failed",
      subsystem: "website_audit",
      operation: "site_readiness",
      status: "failed",
      projectId: input.projectId,
      error,
    });
    // A failed crawl must not fail the audit: the AI-cognition half of a website
    // audit stands on its own, and a score is simply withheld.
    return { status: "failed", reason };
  }
}

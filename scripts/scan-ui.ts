import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

const baseUrl = process.env.SCAN_BASE_URL ?? "http://localhost:3001";
const outputDir = join(process.cwd(), ".artifacts", "ui-scan");

type ScanResult = {
  url: string;
  title: string;
  h1: string | null;
  status?: number;
  consoleErrors: string[];
  pageErrors: string[];
  hasOverlay: boolean;
  bodyLength: number;
  screenshot: string;
};

mkdirSync(outputDir, { recursive: true });

async function capture(page: Page, slug: string): Promise<ScanResult> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.waitForLoadState("networkidle");
  const screenshot = join(outputDir, `${slug}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  const title = await page.title();
  const bodyLength = await page.evaluate(() => document.body.innerText.trim().length);
  const hasOverlay = await page.evaluate(() =>
    Boolean(document.querySelector("[data-nextjs-dialog], #webpack-dev-server-client-overlay")),
  );

  return {
    url: page.url(),
    title,
    h1,
    consoleErrors,
    pageErrors,
    hasOverlay,
    bodyLength,
    screenshot,
  };
}

async function login(
  context: BrowserContext,
  locale: string,
  email: string,
  password: string,
  expectedPath: string,
) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/${locale}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /log in|登录/i }).click();
  await page.waitForURL(`**${expectedPath}`, { timeout: 30000 });
  return page;
}

async function createProject(page: Page, locale: string) {
  await page.goto(`${baseUrl}/${locale}/app/projects/new`, { waitUntil: "networkidle" });
  await page.getByLabel("Project name").fill("Scan Test CIP Project");
  await page.getByLabel("Brand name").fill("Scan Brand");
  await page.getByLabel("Website/domain").fill("https://scan-brand.example.com");
  await page.getByLabel("Industry").fill("B2B SaaS");
  await page.getByLabel("Language").fill("en");
  await page
    .getByLabel("Target market")
    .fill("US growth teams evaluating cognition observability and AI answer inclusion tooling");

  const competitorName = page.locator('input[placeholder="Competitor name"]').first();
  const competitorDomain = page.locator('input[placeholder="https://competitor.com"]').first();
  if (await competitorName.count()) {
    await competitorName.fill("Competitor Scan");
  }
  if (await competitorDomain.count()) {
    await competitorDomain.fill("https://competitor-scan.example.com");
  }

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/projects") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    ),
    page.getByRole("button", { name: /create project|创建项目|save project/i }).click(),
  ]);
  await page.waitForURL(`**/${locale}/app/projects/**/dashboard`, { timeout: 30000 });
  return page.url().split("/").at(-2) ?? null;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results: Record<string, unknown> = {};

  try {
    const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const publicPage = await publicContext.newPage();

    await publicPage.goto(`${baseUrl}/zh-CN`, { waitUntil: "domcontentloaded" });
    results.home = await capture(publicPage, "home-zh");

    await publicPage.goto(`${baseUrl}/zh-CN/start`, { waitUntil: "domcontentloaded" });
    results.start = await capture(publicPage, "start-zh");

    await publicPage.goto(`${baseUrl}/zh-CN/product`, { waitUntil: "domcontentloaded" });
    results.product = await capture(publicPage, "product-zh");

    const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const operatorPage = await login(
      operatorContext,
      "zh-CN",
      "operator@aeo.local",
      "Operator@123456",
      "/zh-CN/admin",
    );
    results.adminOverview = await capture(operatorPage, "admin-overview");

    await operatorPage.goto(`${baseUrl}/zh-CN/admin/ai-providers`, { waitUntil: "domcontentloaded" });
    results.adminProviders = await capture(operatorPage, "admin-providers");

    await operatorPage.goto(`${baseUrl}/zh-CN/admin/system`, { waitUntil: "domcontentloaded" });
    results.adminSystem = await capture(operatorPage, "admin-system");

    const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const customerPage = await login(
      customerContext,
      "zh-CN",
      "demo@observable-ai.local",
      "Customer@123456",
      "/zh-CN/app/projects",
    );
    results.projects = await capture(customerPage, "projects");

    const projectId = await createProject(customerPage, "zh-CN");
    results.createdProjectId = projectId;
    results.dashboard = await capture(customerPage, "project-dashboard");

    if (projectId) {
      const projectBase = `${baseUrl}/zh-CN/app/projects/${projectId}`;
      const subpages = [
        ["keywords", "project-keywords"],
        ["queries", "project-queries"],
        ["runs", "project-runs"],
        ["entity", "project-entity"],
        ["semantic-coverage", "project-coverage"],
        ["alerts", "project-alerts"],
        ["reports", "project-reports"],
      ] as const;

      for (const [segment, slug] of subpages) {
        await customerPage.goto(`${projectBase}/${segment}`, { waitUntil: "domcontentloaded" });
        results[segment] = await capture(customerPage, slug);
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(join(outputDir, "report.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

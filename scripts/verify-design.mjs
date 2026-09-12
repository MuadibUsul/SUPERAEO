import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.DESIGN_BASE_URL || "http://localhost:3000";
const artifacts = ".artifacts/design-review";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.setDefaultNavigationTimeout(120_000);

async function inspect(path, name, mobile = false) {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
  const response = await page.goto(`${base}${path}`);
  assert.equal(response?.status(), 200, `${path}: HTTP status`);
  await page.locator("h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Let the retained canvas initialize before capturing its first frame.
  if (await page.locator("canvas").count()) await page.waitForTimeout(1800);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  if (dimensions.content > dimensions.width + 1) await page.screenshot({ path: `${artifacts}/${name}-overflow.png` });
  assert.ok(dimensions.content <= dimensions.width + 1, `${path}: horizontal overflow ${JSON.stringify(dimensions)}`);
  assert.equal(errors.length, 0, errors.join("\n"));
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: false });
  console.log(`PASS ${name} ${path}`);
}

try {
  if (!process.env.DESIGN_ONLY_PRIVATE) {
  await inspect("/zh-CN", "home-desktop");
  await inspect("/zh-CN", "home-mobile", true);
  await page.getByLabel("打开菜单", { exact: true }).click();
  await page.getByRole("link", { name: "方法与信任", exact: true }).last().click();
  await page.waitForURL("**/methodology");
  console.log("PASS mobile public navigation");
  await inspect("/en", "home-en");
  for (const route of ["login", "signup", "product", "pricing", "methodology", "start"]) {
    await inspect(`/zh-CN/${route}`, `public-${route}`, route === "login");
  }
  }
  if (process.env.DESIGN_TEST_EMAIL && process.env.DESIGN_TEST_PASSWORD) {
    const login = await context.request.post(`${base}/api/auth/login`, { data: { email: process.env.DESIGN_TEST_EMAIL, password: process.env.DESIGN_TEST_PASSWORD, locale: "zh-CN" } });
    assert.ok(login.ok(), `Test login failed: ${login.status()}`);
    await inspect("/zh-CN/app/projects", "projects");
    const projectHref = await page.locator('a[href$="/dashboard"]').first().getAttribute("href");
    assert.ok(projectHref, "No project available for authenticated verification");
    const projectBase = projectHref.replace(/\/dashboard$/, "");
    for (const segment of ["dashboard", "semantic-nebula", "opportunities", "runs", "evidence", "proof", "reports", "settings"]) {
      await inspect(`${projectBase}/${segment}`, `project-${segment}`);
    }
    await inspect(`${projectBase}/dashboard`, "dashboard-mobile", true);
    await page.getByLabel("打开导航菜单").click();
    await page.getByRole("link", { name: "优先行动", exact: true }).filter({ visible: true }).click();
    await page.waitForURL("**/opportunities");
    console.log("PASS mobile project navigation");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const action = page.locator('button[aria-haspopup="dialog"]').first();
    if (await action.count()) {
      await page.getByLabel("搜索行动").fill("no-match-7f6bd40b");
      await page.getByText("没有符合条件的行动，试试其他优先级或关键词。", { exact: true }).waitFor();
      await page.getByLabel("搜索行动").fill("");
      await action.click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ path: `${artifacts}/action-detail.png` });
      assert.ok(await page.getByRole("dialog").evaluate(element => element.contains(document.activeElement)), "Dialog must contain keyboard focus");
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.ok(await action.evaluate(element => element === document.activeElement), "Return focus to action after closing");
      console.log("PASS action search, details, Escape, and focus restoration");
    }
    const projectId = projectBase.split("/").at(-1);
    for (const format of ["json", "csv"]) {
      const exported = await context.request.get(`${base}/api/projects/${projectId}/evidence?format=${format}`);
      assert.ok(exported.ok(), `Private ${format} evidence export`);
    }
    console.log("PASS private JSON and CSV exports");
    await inspect("/zh-CN/app/projects/new", "new-project");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    assert.ok(await page.getByRole("button", { name: "下一步", exact: true }).isDisabled(), "Required setup context gates next step");
    await page.getByLabel("品牌名称", { exact: true }).fill("Visual verification only");
    await page.getByLabel("品类 / 赛道", { exact: true }).fill("Research tools");
    await page.getByLabel("目标用户或市场", { exact: true }).fill("Research teams");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByText("Visual verification only", { exact: true }).waitFor();
    console.log("PASS setup wizard validation and confirmation; not submitted");
    if (process.env.DESIGN_EXTENDED) {
      for (const segment of ["evidence", "runs", "reports", "proof", "opportunities", "semantic-nebula", "settings", "semantic-coverage", "question-territory", "alerts", "entity", "competitors", "keywords", "queries"]) {
        await inspect(`${projectBase}/${segment}`, `mobile-${segment}`, true);
      }
      await inspect(projectHref.replace("/zh-CN/", "/en/"), "dashboard-en");
      await inspect("/zh-CN/app/projects?q=no-match-7f6bd40b", "projects-search-empty");
      await page.getByText("没有找到匹配的项目，请换个关键词。", { exact: true }).waitFor();
      console.log("PASS project search empty state");
    }
    console.log("PASS authenticated routes; no sampling or project writes performed");
  } else console.log("SKIP authenticated routes: provide DESIGN_TEST_EMAIL and DESIGN_TEST_PASSWORD");
  if (process.env.DESIGN_ADMIN_EMAIL && process.env.DESIGN_ADMIN_PASSWORD) {
    await context.clearCookies();
    const login = await context.request.post(`${base}/api/auth/login`, { data: { email: process.env.DESIGN_ADMIN_EMAIL, password: process.env.DESIGN_ADMIN_PASSWORD, locale: "zh-CN" } });
    assert.ok(login.ok(), "Admin test login failed");
    await inspect("/zh-CN/admin", "admin-desktop");
    await inspect("/zh-CN/admin/users", "admin-users-mobile", true);
    await page.getByLabel("打开导航菜单").click();
    assert.ok(await page.getByRole("link", { name: "AI Providers", exact: true }).count() || await page.locator('details a[href$="/admin/ai-providers"]').isVisible(), "Mobile admin retains provider navigation");
    console.log("PASS admin desktop and mobile navigation");
  }
} finally {
  await browser.close();
}

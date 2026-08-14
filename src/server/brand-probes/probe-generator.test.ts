import assert from "node:assert/strict";
import test from "node:test";

import { getProbeRunConfig } from "@/server/brand-probes/config";
import { generateBrandProbes } from "@/server/brand-probes/probe-generator";
import { buildSeedPool } from "@/server/brand-probes/seed-pool-builder";

const project = {
  id: "p1",
  userId: "u1",
  organizationId: "o1",
  name: "Coca-Cola",
  brandName: "可口可乐",
  domain: "",
  industry: "碳酸饮料",
  targetMarket: "中国",
  language: "zh-CN",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const subject = {
  id: "s1",
  projectId: "p1",
  entityType: "BRAND" as const,
  displayName: "可口可乐",
  canonicalName: "可口可乐",
  websiteUrl: null,
  market: "中国",
  language: "zh-CN",
  profileJson: { aliases: ["Coca-Cola", "Coke"] },
  isPrimary: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

test("standard mode creates layered probes and keeps implicit recommendation non-branded", () => {
  const config = getProbeRunConfig({ mode: "standard" });
  const seedPool = buildSeedPool({
    project,
    subject,
    competitors: [
      { name: "百事可乐", category: "direct" },
      { name: "元气森林", category: "substitution" },
    ],
  });
  const probes = generateBrandProbes({ project, subject, seedPool, config });
  const byZone = new Map<string, number>();
  for (const probe of probes) byZone.set(probe.zone, (byZone.get(probe.zone) ?? 0) + 1);

  assert.equal(probes.length, 360);
  assert.equal(byZone.get("implicit_recommendation"), 80);
  assert.equal(byZone.get("risk_boundary"), 30);
  assert.ok(probes.filter((probe) => probe.zone === "risk_boundary").length / probes.length < 0.12);
  assert.ok(probes.filter((probe) => probe.questionType === "implicit_recommendation").every((probe) => !probe.prompt.includes("可口可乐")));
});

test("max500 mode stays around 480 probes", () => {
  const config = getProbeRunConfig({ mode: "max500" });
  const seedPool = buildSeedPool({ project, subject, competitors: [] });
  const probes = generateBrandProbes({ project, subject, seedPool, config });
  assert.equal(probes.length, 480);
});

test("probe wording adapts to the subject's entity type", () => {
  const config = getProbeRunConfig({ mode: "standard" });
  const competitors = [{ name: "百事可乐", category: "direct" as const }];

  const make = (entityType: "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT") => {
    const seedPool = buildSeedPool({ project, subject, competitors });
    return generateBrandProbes({ project, subject: { ...subject, entityType }, seedPool, config });
  };

  const text = (probes: ReturnType<typeof make>) => probes.map((p) => p.prompt).join("\n");

  const person = text(make("PERSON"));
  assert.ok(person.includes("专家") || person.includes("这个人"), "person probes should use expert/person framing");

  const website = text(make("WEBSITE"));
  assert.ok(website.includes("来源") || website.includes("网站"), "website probes should use source/site framing");

  const product = text(make("PRODUCT"));
  assert.ok(product.includes("产品") && (product.includes("使用场景") || product.includes("特性")), "product probes should use product/use-case framing");

  // The brand baseline should NOT carry the person-specific wording.
  const brand = text(make("BRAND"));
  assert.ok(!brand.includes("这个人"), "brand probes should not use person wording");
});

test("probe prompts follow the subject's input language (English)", () => {
  const enProject = { ...project, language: "en", industry: "carbonated drinks", brandName: "Challenger Cola", targetMarket: "US young adults" };
  const enSubject = { ...subject, language: "en", displayName: "Challenger Cola", canonicalName: "challenger cola", profileJson: {} };
  const config = getProbeRunConfig({ mode: "standard" });
  const seedPool = buildSeedPool({ project: enProject, subject: enSubject, competitors: [{ name: "Coca-Cola", category: "direct" }] });
  const probes = generateBrandProbes({ project: enProject, subject: enSubject, seedPool, config });
  const all = probes.map((p) => p.prompt).join("\n");

  assert.ok(all.includes("Output these fields:"), "should use the English output line");
  assert.ok(!all.includes("统一输出字段"), "should not use the Chinese output line");
  assert.ok(/recommend|sources|product|when you/i.test(all), "should contain English question wording");
  assert.ok(!/[一-鿿]/u.test(all), "English-language probes must not contain Chinese characters");
});

test("full diagnosis can require structured semantic units without an environment flag", () => {
  const enProject = { ...project, language: "en", industry: "chips", brandName: "NVIDIA", targetMarket: "global" };
  const enSubject = { ...subject, language: "en", displayName: "NVIDIA", canonicalName: "nvidia", profileJson: {} };
  const config = getProbeRunConfig({ mode: "standard" });
  const seedPool = buildSeedPool({ project: enProject, subject: enSubject, competitors: [] });
  const [probe] = generateBrandProbes({ project: enProject, subject: enSubject, seedPool, config, semanticExploration: true });

  assert.ok(probe.prompt.includes("semantic_units"));
  assert.ok(probe.prompt.includes("subject/predicate/object"));
  assert.ok("semantic_units" in (probe.expectedOutputSchema.properties as Record<string, unknown>));
});

test("generated semantic keywords feed the diagnosis seed pool", () => {
  const seedPool = buildSeedPool({
    project,
    subject,
    competitors: [],
    keywords: [
      { keyword: "supply chain resilience", keywordType: "attribute" },
      { keyword: "export control exposure", keywordType: "risk" },
      { keyword: "data-center procurement", keywordType: "scenario" },
    ],
  });

  assert.ok(seedPool.hotTerms.includes("supply chain resilience"));
  assert.ok(seedPool.risks.includes("export control exposure"));
  assert.ok(seedPool.scenarios.includes("data-center procurement"));
});

test("max1000 mode produces 1000 probes balanced across priority/breadth/depth", () => {
  const config = getProbeRunConfig({ mode: "max1000" });
  const seedPool = buildSeedPool({
    project,
    subject,
    competitors: [
      { name: "百事可乐", category: "direct" },
      { name: "元气森林", category: "substitution" },
    ],
  });
  const probes = generateBrandProbes({ project, subject, seedPool, config });
  assert.equal(probes.length, 1000);

  // 重点 (priority): the two money zones keep the largest share.
  const byZone = new Map<string, number>();
  for (const probe of probes) byZone.set(probe.zone, (byZone.get(probe.zone) ?? 0) + 1);
  assert.equal(byZone.get("implicit_recommendation"), 200);
  assert.equal(byZone.get("competition"), 200);

  // 深度 (depth): probes cycle through multiple depth levels.
  const depthLevels = new Set(probes.map((probe) => String(probe.variables.depthLevel)));
  assert.ok(depthLevels.size >= 3, `expected >=3 depth levels, got ${depthLevels.size}`);

  // 广度 (breadth): scenario-driven zones cover many distinct questions, not a
  // handful repeated. Check the breadth zones have high prompt diversity.
  const breadth = probes.filter((p) => p.zone === "scenario_fit" || p.zone === "implicit_recommendation");
  const distinct = new Set(breadth.map((p) => p.prompt)).size;
  assert.ok(distinct >= 120, `expected >=120 distinct breadth prompts, got ${distinct}`);

  // implicit_recommendation must stay unprompted (never names the brand).
  assert.ok(
    probes.filter((p) => p.questionType === "implicit_recommendation").every((p) => !p.prompt.includes("可口可乐")),
  );
});

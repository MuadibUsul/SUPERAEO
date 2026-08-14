import assert from "node:assert/strict";
import test from "node:test";

import type { Project, ProjectSubject, SubjectEntityType } from "@/generated/prisma/client";
import { auditTypeSpecs, comparisonCategoryFor, seedVocabularyFor } from "@/server/audit-types/spec";
import { buildSeedPool } from "@/server/brand-probes/seed-pool-builder";
import { getEntityProfile } from "@/server/entity/entity-profiles";

const entityTypes: SubjectEntityType[] = ["BRAND", "PERSON", "WEBSITE", "PRODUCT"];

function projectFor(language: string): Project {
  return {
    id: "project-1",
    brandName: "测试主体",
    industry: "测试领域",
    targetMarket: "中国",
    domain: "example.com",
    language,
  } as Project;
}

function subjectFor(entityType: SubjectEntityType, language: string): ProjectSubject {
  return {
    id: "subject-1",
    projectId: "project-1",
    entityType,
    displayName: "测试主体",
    canonicalName: "测试主体",
    language,
    profileJson: {},
  } as unknown as ProjectSubject;
}

function seedsFor(entityType: SubjectEntityType, language = "zh-CN") {
  return buildSeedPool({
    project: projectFor(language),
    subject: subjectFor(entityType, language),
    competitors: [],
  });
}

test("commerce vocabulary never leaks into non-brand audits", () => {
  // The root cause this work fixes: buildSeedPool ignored entityType and fed
  // B2B procurement language into every type, so a person audit asked who was
  // more authoritative while its scenario slot said "annual renewal decision".
  const commerce = ["续费", "购买", "采购", "预算审批", "试用后转正", "向上汇报", "买家", "供应商锁定"];

  for (const entityType of ["PERSON", "WEBSITE"] as const) {
    const seeds = seedsFor(entityType);
    const text = [...seeds.scenarios, ...seeds.audiences, ...seeds.intents].join(" ");
    for (const term of commerce) {
      assert.ok(!text.includes(term), `${entityType} seeds must not contain "${term}"`);
    }
  }
});

test("each audit type gets its own scenario vocabulary", () => {
  const scenarioSets = entityTypes.map((entityType) => new Set(seedsFor(entityType).scenarios));

  for (let i = 0; i < scenarioSets.length; i += 1) {
    for (let j = i + 1; j < scenarioSets.length; j += 1) {
      const shared = [...scenarioSets[i]].filter((scenario) => scenarioSets[j].has(scenario));
      assert.equal(
        shared.length,
        0,
        `${entityTypes[i]} and ${entityTypes[j]} share scenarios: ${shared.join(", ")}`,
      );
    }
  }
});

test("no named competitor is invented when the customer supplied none", () => {
  // Previously a beverage-looking project silently gained 雪碧 / 农夫山泉 /
  // Starbucks as competitors, which then appeared in the customer's report.
  const invented = ["雪碧", "农夫山泉", "东方树叶", "元气森林", "瑞幸咖啡", "Sprite", "Starbucks", "Evian", "Monster"];
  const seeds = buildSeedPool({
    project: { ...projectFor("zh-CN"), industry: "饮料", brandName: "可口可乐" } as Project,
    subject: subjectFor("BRAND", "zh-CN"),
    competitors: [],
  });

  assert.deepEqual(seeds.coreCompetitors, [], "no named competitor without one declared");
  const all = [...seeds.adjacentCompetitors, ...seeds.substitutionCompetitors].join(" ");
  for (const name of invented) {
    assert.ok(!all.includes(name), `must not invent the competitor "${name}"`);
  }
  // The slots are still filled, but with descriptors rather than named entities,
  // so comparison probes keep working without asserting a false relationship.
  assert.ok(seeds.adjacentCompetitors.length > 0);
  assert.ok(seeds.substitutionCompetitors.length > 0);
});

test("declared comparison targets fill the named slots without duplicating", () => {
  const seeds = buildSeedPool({
    project: projectFor("zh-CN"),
    subject: subjectFor("BRAND", "zh-CN"),
    competitors: [
      { name: "竞品甲", category: "direct" },
      { name: "竞品乙", category: "substitution" },
    ],
  });

  assert.deepEqual(seeds.coreCompetitors, ["竞品甲", "竞品乙"]);
  // Already used in the core slot, so they are not repeated in the others; the
  // remaining slots fall back to descriptors rather than restating a name.
  for (const name of seeds.coreCompetitors) {
    assert.ok(!seeds.adjacentCompetitors.includes(name), `${name} repeated in adjacent`);
    assert.ok(!seeds.substitutionCompetitors.includes(name), `${name} repeated in substitution`);
  }
});

test("declared targets beyond the core slot still surface by name", () => {
  const competitors = Array.from({ length: 7 }, (_, index) => ({
    name: `竞品${index + 1}`,
    category: index % 2 === 0 ? "direct" : "substitution",
  }));
  const seeds = buildSeedPool({
    project: projectFor("zh-CN"),
    subject: subjectFor("BRAND", "zh-CN"),
    competitors,
  });

  assert.equal(seeds.coreCompetitors.length, 5);
  // The 6th and 7th declared names are not silently dropped.
  assert.ok(seeds.substitutionCompetitors.includes("竞品6"));
  assert.ok(seeds.substitutionCompetitors.includes("竞品7"));
});

test("comparison descriptors speak the audit type's language", () => {
  const person = seedsFor("PERSON");
  const website = seedsFor("WEBSITE");
  const descriptors = (seeds: ReturnType<typeof seedsFor>) =>
    [...seeds.adjacentCompetitors, ...seeds.substitutionCompetitors].join(" ");

  // A person is compared to peers, not to brands or products.
  assert.ok(/权威|同行|作者|专家/u.test(descriptors(person)));
  assert.ok(!/品牌|产品|型号/u.test(descriptors(person)));
  // A website is compared to other sources.
  assert.ok(/网站|来源|百科|媒体|社区/u.test(descriptors(website)));
  assert.ok(!/品牌|型号/u.test(descriptors(website)));
});

test("project keywords win over the fallback vocabulary", () => {
  const seeds = buildSeedPool({
    project: projectFor("zh-CN"),
    subject: subjectFor("PERSON", "zh-CN"),
    competitors: [],
    keywords: [{ keyword: "量子计算综述", keywordType: "scenario" } as never],
  });

  assert.equal(seeds.scenarios[0], "量子计算综述", "AI-generated keywords must lead the slot");
});

test("seed vocabulary is language-aware", () => {
  const zh = seedVocabularyFor("PERSON", "zh-CN");
  const en = seedVocabularyFor("PERSON", "en");

  assert.notDeepEqual(zh.scenarios, en.scenarios);
  assert.ok(/[一-龥]/u.test(zh.scenarios.join("")));
  assert.ok(!/[一-龥]/u.test(en.scenarios.join("")));
});

test("every type has enough vocabulary for probe breadth", () => {
  // Probe prompts are combinations of scenario x audience x intent. Thin lists
  // collapse a 1000-probe run into a few dozen distinct questions.
  for (const entityType of entityTypes) {
    for (const language of ["zh-CN", "en"]) {
      const vocabulary = seedVocabularyFor(entityType, language);
      assert.ok(vocabulary.scenarios.length >= 12, `${entityType}/${language} scenarios`);
      assert.ok(vocabulary.audiences.length >= 10, `${entityType}/${language} audiences`);
      assert.ok(vocabulary.intents.length >= 10, `${entityType}/${language} intents`);
    }
  }
});

test("comparison category comes from the entity profile, not a second copy", () => {
  for (const entityType of entityTypes) {
    assert.equal(comparisonCategoryFor(entityType), getEntityProfile(entityType).competitorKind);
  }
  assert.equal(comparisonCategoryFor("PERSON"), "peer_expert");
  assert.equal(comparisonCategoryFor("WEBSITE"), "alternative_source");
  assert.equal(comparisonCategoryFor("PRODUCT"), "substitute_product");
  assert.equal(comparisonCategoryFor("BRAND"), "direct");
});

test("the four types lead with different headline metrics and risks", () => {
  const headlines = entityTypes.map((entityType) => getEntityProfile(entityType).primaryMetrics[0]);
  const risks = entityTypes.map((entityType) => getEntityProfile(entityType).topRisk["zh-CN"]);

  assert.equal(new Set(risks).size, entityTypes.length, "each type must name its own worst case");
  // BRAND and PRODUCT both lead on recommendation share by design; they diverge
  // on the second metric (competitor distance vs feature accuracy).
  assert.ok(new Set(headlines).size >= 3, `expected >=3 distinct headline metrics, got ${headlines.join(", ")}`);
  assert.notDeepEqual(
    getEntityProfile("BRAND").primaryMetrics,
    getEntityProfile("PRODUCT").primaryMetrics,
  );
});

test("required inputs differ per type and a website needs a real URL", () => {
  const fieldsFor = (entityType: SubjectEntityType) =>
    auditTypeSpecs[entityType].requiredInputs.map((input) => input.field);

  assert.ok(fieldsFor("WEBSITE").includes("websiteUrl"));
  assert.ok(!fieldsFor("PERSON").includes("websiteUrl"));
  assert.ok(fieldsFor("PRODUCT").includes("desiredUnderstanding"));
  // A person audit must not demand a market; that is a brand-shaped question.
  assert.ok(!fieldsFor("PERSON").includes("market"));

  const urlCheck = auditTypeSpecs.WEBSITE.requiredInputs.find((input) => input.field === "websiteUrl")?.validate;
  assert.ok(urlCheck);
  assert.equal(urlCheck("example.com"), true);
  assert.equal(urlCheck("https://example.com/docs"), true);
  assert.equal(urlCheck("not a url"), false);
  assert.equal(urlCheck("localhost"), false);
});

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

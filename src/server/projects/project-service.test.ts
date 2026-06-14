import assert from "node:assert/strict";
import test from "node:test";

import { buildAuditNamePreview, getComparisonCategory } from "@/components/project/project-form-helpers";
import { generateDefaultProjectName } from "@/server/projects/project-service";

test("generates localized default audit names when project name is blank", () => {
  assert.equal(
    generateDefaultProjectName({ name: "", brandName: "Elon Musk", language: "zh-CN" }),
    "Elon Musk AI 认知审计",
  );
  assert.equal(
    generateDefaultProjectName({ name: "", brandName: "CIP", language: "en" }),
    "CIP AI Cognition Audit",
  );
  assert.equal(
    generateDefaultProjectName({ name: "Custom audit", brandName: "CIP", language: "en" }),
    "Custom audit",
  );
});

test("uses entity-aware comparison categories for project wizard submissions", () => {
  assert.equal(getComparisonCategory("PERSON"), "peer_expert");
  assert.equal(getComparisonCategory("WEBSITE"), "alternative_source");
  assert.equal(getComparisonCategory("PRODUCT"), "substitute_product");
  assert.equal(getComparisonCategory("BRAND"), "direct");
});

test("previews audit names without requiring customer input", () => {
  assert.equal(
    buildAuditNamePreview({ subjectName: "", fallbackSubject: "实体名称", language: "zh-CN" }),
    "实体名称 AI 认知审计",
  );
  assert.equal(
    buildAuditNamePreview({ subjectName: "Jane Lin", fallbackSubject: "Entity name", language: "en" }),
    "Jane Lin AI Cognition Audit",
  );
});

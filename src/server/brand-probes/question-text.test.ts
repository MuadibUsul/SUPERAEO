import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanQuestionText } from "@/server/brand-probes/question-text";

test("strips the Chinese unified-output-field scaffolding", () => {
  const raw = "提到「Tlines 全球机构情报」这个网站，你会想到覆盖的主题、内容类型、可信度。\n\n统一输出字段：probe_id, target_mentioned, recommended_entities, keywords。\n只输出 JSON，不要输出自然语言解释。";
  assert.equal(cleanQuestionText(raw), "提到「Tlines 全球机构情报」这个网站，你会想到覆盖的主题、内容类型、可信度。");
});

test("strips the English output-fields scaffolding", () => {
  const raw = "Which sites would you cite for an authoritative definition?\n\nOutput these fields: probe_id, target_mentioned, confidence.\nReturn JSON only.";
  assert.equal(cleanQuestionText(raw), "Which sites would you cite for an authoritative definition?");
});

test("cuts at the earliest marker when several are present", () => {
  const raw = "Real question here. 只输出 JSON. Output these fields: probe_id.";
  assert.equal(cleanQuestionText(raw), "Real question here.");
});

test("leaves a clean question untouched", () => {
  const raw = "What do you associate with this brand?";
  assert.equal(cleanQuestionText(raw), raw);
});

test("falls back to the original when a marker sits at the very start", () => {
  const raw = "统一输出字段：probe_id";
  assert.equal(cleanQuestionText(raw), raw);
});

test("handles empty and nullish input", () => {
  assert.equal(cleanQuestionText(""), "");
  assert.equal(cleanQuestionText(null), "");
  assert.equal(cleanQuestionText(undefined), "");
});

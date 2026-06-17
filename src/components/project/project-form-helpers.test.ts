import assert from "node:assert/strict";
import { test } from "node:test";

import { detectAuditLanguage } from "./project-form-helpers";

test("detectAuditLanguage picks language from the typed script", () => {
  assert.equal(detectAuditLanguage("Cognition Intelligence Platform"), "en");
  assert.equal(detectAuditLanguage("挑战者饮料"), "zh-CN");
  assert.equal(detectAuditLanguage("ChatGPT で 認知 を 監査"), "ja"); // kana wins over kanji
  assert.equal(detectAuditLanguage("브랜드 인식 감사"), "ko");
  assert.equal(detectAuditLanguage("Бренд анализ"), "ru");
  assert.equal(detectAuditLanguage("", "zh-CN"), "zh-CN"); // empty falls back to UI locale
  assert.equal(detectAuditLanguage("低糖 sparkling drink"), "zh-CN"); // any Han → zh
});

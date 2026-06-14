import assert from "node:assert/strict";
import test from "node:test";

import { isUsableTerm, normalizeTerm, uniqueNormalizedTerms } from "@/server/semantic-nebula/term-normalizer";

test("normalizes terms with punctuation and spacing", () => {
  assert.equal(normalizeTerm("  Low-Sugar,  Drink! "), "low-sugar drink");
  assert.equal(normalizeTerm("低糖， 气泡"), "低糖 气泡");
});

test("deduplicates by normalized term", () => {
  assert.deepEqual(uniqueNormalizedTerms(["Low Sugar", " low sugar ", "Office"]), ["low sugar", "Office"]);
  assert.equal(isUsableTerm("1"), false);
});

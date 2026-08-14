import assert from "node:assert/strict";
import test from "node:test";

import { inferMentionedBrand } from "@/server/brand-probes/signal-extractor";
import { probeBatchResponseSchema } from "@/server/brand-probes/types";

test("accepts object-wrapped batches and normalizes common provider drift", () => {
  const parsed = probeBatchResponseSchema.safeParse({
    items: [{
      probe_id: "p1",
      mentioned_brand: [],
      recommended_brands: [{ name: "Coca-Cola", reason: "classic" }],
      semantic_units: [{ domain: "brand", type: "COMPANY", canonicalLabel: "Coca-Cola" }],
    }],
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data[0]?.mentioned_brand, false);
  assert.equal(parsed.data[0]?.recommended_brands[0]?.brand, "Coca-Cola");
  assert.deepEqual(parsed.data[0]?.recommended_brands[0]?.reason_tags, ["classic"]);
  assert.equal(parsed.data[0]?.semantic_units[0]?.domain, "ENTITY");
  assert.equal(inferMentionedBrand(parsed.data[0]!, ["Coca-Cola", "可口可乐"]), true);
});

test("infers a brand mention from semantic units when the provider returns false", () => {
  const parsed = probeBatchResponseSchema.parse({
    items: [{
      probe_id: "p1",
      mentioned_brand: false,
      semantic_units: [{ domain: "ENTITY", type: "COMPANY", canonicalLabel: "可口可乐品牌" }],
    }],
  });

  assert.equal(inferMentionedBrand(parsed[0]!, ["可口可乐"]), true);
});

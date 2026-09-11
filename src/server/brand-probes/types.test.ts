import assert from "node:assert/strict";
import test from "node:test";

import { inferMentionedBrand } from "@/server/brand-probes/signal-extractor";
import { probeBatchResponseSchema } from "@/server/brand-probes/types";

test("accepts object-wrapped batches and normalizes common provider drift", () => {
  // The wire fields are `target_mentioned` / `recommended_entities`, but a model
  // that answers in the older brand vocabulary is still understood — that is
  // output tolerance, not a compatibility layer for stored rows.
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
  assert.equal(parsed.data[0]?.target_mentioned, false);
  assert.equal(parsed.data[0]?.recommended_entities[0]?.entity, "Coca-Cola");
  assert.deepEqual(parsed.data[0]?.recommended_entities[0]?.reason_tags, ["classic"]);
  assert.equal(parsed.data[0]?.semantic_units[0]?.domain, "ENTITY");
  assert.equal(inferMentionedBrand(parsed.data[0]!, ["Coca-Cola", "可口可乐"]), true);
});

test("reads the canonical entity-neutral field names", () => {
  const parsed = probeBatchResponseSchema.parse({
    items: [{
      probe_id: "p1",
      target_mentioned: true,
      // A person audit: the recommended entities are people, not brands.
      recommended_entities: [
        { entity: "Jane Roe", rank: 1, score: 90, reason_tags: ["cited widely"] },
        "John Doe",
      ],
    }],
  });

  assert.equal(parsed[0]?.target_mentioned, true);
  assert.equal(parsed[0]?.recommended_entities[0]?.entity, "Jane Roe");
  assert.equal(parsed[0]?.recommended_entities[1]?.entity, "John Doe");
});

test("infers a target mention from semantic units when the provider returns false", () => {
  const parsed = probeBatchResponseSchema.parse({
    items: [{
      probe_id: "p1",
      target_mentioned: false,
      semantic_units: [{ domain: "ENTITY", type: "COMPANY", canonicalLabel: "可口可乐品牌" }],
    }],
  });

  assert.equal(inferMentionedBrand(parsed[0]!, ["可口可乐"]), true);
});

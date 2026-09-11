import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { canonicalJson, publicReportProjection, signManifest, verifyManifest } from "./manifest";

test("canonical JSON is stable regardless of object key order", () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
});

test("Ed25519 manifest signature rejects tampering", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const oldKey = process.env.REPORT_SIGNING_PRIVATE_KEY;
  const oldId = process.env.REPORT_SIGNING_KEY_ID;
  process.env.REPORT_SIGNING_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.REPORT_SIGNING_KEY_ID = "test-key";
  try {
    const signed = signManifest({ answer: 42 });
    assert.equal(verifyManifest({ answer: 42 }, signed.signature, signed.publicKey), true);
    assert.equal(verifyManifest({ answer: 43 }, signed.signature, signed.publicKey), false);
  } finally {
    if (oldKey === undefined) delete process.env.REPORT_SIGNING_PRIVATE_KEY; else process.env.REPORT_SIGNING_PRIVATE_KEY = oldKey;
    if (oldId === undefined) delete process.env.REPORT_SIGNING_KEY_ID; else process.env.REPORT_SIGNING_KEY_ID = oldId;
  }
});

test("public projection excludes prompts and full raw answers", () => {
  const projected = publicReportProjection({ generatedAt: "now", subjectName: "Acme", metrics: { sampleCount: 1, metrics: {}, reliability: {} }, responses: [{ id: "r1", queryText: "q", normalizedAnswer: "a", rawResponse: "secret raw", systemPrompt: "secret prompt" }] });
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("secret raw"), false);
  assert.equal(serialized.includes("secret prompt"), false);
});

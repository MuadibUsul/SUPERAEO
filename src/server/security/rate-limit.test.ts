import assert from "node:assert/strict";
import test from "node:test";

import { requestClientIdentity } from "@/server/security/rate-limit";

function requestWith(headers: Record<string, string>) {
  return new Request("https://example.test/api/auth/login", { method: "POST", headers });
}

test("forwarded-for headers are ignored unless a trusted proxy is declared", () => {
  const previous = process.env.TRUSTED_PROXY;
  delete process.env.TRUSTED_PROXY;

  try {
    // Spoofable by any client, so it must not become a rate-limit bucket key —
    // varying it per request would otherwise bypass the limiter entirely.
    assert.equal(requestClientIdentity(requestWith({ "x-forwarded-for": "1.2.3.4" })), null);
    assert.equal(requestClientIdentity(requestWith({ "x-real-ip": "1.2.3.4" })), null);
    assert.equal(requestClientIdentity(requestWith({ "cf-connecting-ip": "1.2.3.4" })), null);
    assert.equal(requestClientIdentity(requestWith({})), null);
  } finally {
    if (previous === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = previous;
  }
});

test("behind a trusted proxy the client address is used, most specific header first", () => {
  const previous = process.env.TRUSTED_PROXY;
  process.env.TRUSTED_PROXY = "true";

  try {
    assert.equal(
      requestClientIdentity(requestWith({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })),
      "9.9.9.9",
    );
    assert.equal(requestClientIdentity(requestWith({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
    // Only the original client, not the whole proxy chain.
    assert.equal(requestClientIdentity(requestWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "1.1.1.1");
    assert.equal(requestClientIdentity(requestWith({})), "unknown");
  } finally {
    if (previous === undefined) delete process.env.TRUSTED_PROXY;
    else process.env.TRUSTED_PROXY = previous;
  }
});

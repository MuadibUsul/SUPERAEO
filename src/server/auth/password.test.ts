import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "@/server/auth/password";

test("a freshly hashed password verifies, a wrong one does not", async () => {
  const stored = await hashPassword("correct horse battery staple");

  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
  assert.equal(await verifyPassword("Correct horse battery staple", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("each hash carries its own salt", async () => {
  const first = await hashPassword("same password");
  const second = await hashPassword("same password");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("same password", first), true);
  assert.equal(await verifyPassword("same password", second), true);
});

test("a malformed stored hash fails the login instead of throwing", async () => {
  // timingSafeEqual throws on a length mismatch. A truncated or otherwise
  // corrupt hash used to surface as a 500 from the login route rather than as
  // an ordinary rejected credential.
  const malformed = [
    "",
    "no-separator",
    ":",
    "salt:",
    ":deadbeef",
    "salt:deadbeef", // valid hex, but far shorter than a scrypt key
    `salt:${"ab".repeat(63)}`, // one byte short
    `salt:${"ab".repeat(65)}`, // one byte long
    "salt:zzzz", // not hex at all
  ];

  for (const stored of malformed) {
    assert.equal(await verifyPassword("any password", stored), false, `expected false for ${JSON.stringify(stored)}`);
  }
});

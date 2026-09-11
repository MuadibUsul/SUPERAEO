import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeSourceUrl, classifySource, isPrivateAddress } from "./source-verifier";

test("blocks private, loopback, link-local, mapped, and metadata addresses", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) assert.equal(isPrivateAddress(address), true, address);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
});

test("rejects unsafe protocols and URL credentials", async () => {
  await assert.rejects(() => assertSafeSourceUrl("file:///etc/passwd"));
  await assert.rejects(() => assertSafeSourceUrl("https://user:pass@example.com"));
  await assert.rejects(() => assertSafeSourceUrl("http://127.0.0.1/latest/meta-data"));
});

test("classifies common source categories", () => {
  assert.equal(classifySource(new URL("https://docs.acme.com/x"), "acme.com"), "SUBJECT_OFFICIAL");
  assert.equal(classifySource(new URL("https://example.gov/x")), "GOVERNMENT_STANDARD");
  assert.equal(classifySource(new URL("https://lab.example.edu/x")), "ACADEMIC");
  assert.equal(classifySource(new URL("https://reddit.com/r/x")), "COMMUNITY");
  assert.equal(classifySource(new URL("https://reuters.com/world")), "PROFESSIONAL_MEDIA");
  assert.equal(classifySource(new URL("https://vendor.example.com/x")), "COMMERCIAL");
});

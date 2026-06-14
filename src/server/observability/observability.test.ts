import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import { CipError, normalizeError } from "@/server/observability/errors";
import { redactSensitiveValue } from "@/server/observability/redaction";
import { withApiTrace } from "@/server/observability/api-wrapper";

test("redacts sensitive metadata keys before logging", () => {
  const redacted = redactSensitiveValue({
    email: "demo@example.com",
    password: "secret-password",
    headers: {
      authorization: "Bearer token",
      cookie: "aeo_session=token",
    },
    nested: [{ apiKey: "sk-test" }],
  }) as Record<string, unknown>;

  assert.equal(redacted.email, "demo@example.com");
  assert.equal(redacted.password, "[REDACTED]");
  assert.deepEqual(redacted.headers, {
    authorization: "[REDACTED]",
    cookie: "[REDACTED]",
  });
  assert.deepEqual(redacted.nested, [{ apiKey: "[REDACTED]" }]);
});

test("normalizes expected and unknown errors", () => {
  assert.deepEqual(normalizeError(new CipError("No access", { errorCode: "NO_ACCESS", status: 403 })), {
    errorCode: "NO_ACCESS",
    safeMessage: "No access",
    status: 403,
    name: "CipError",
    cause: undefined,
  });

  const unknown = normalizeError("boom");
  assert.equal(unknown.errorCode, "UNKNOWN_ERROR");
  assert.equal(unknown.status, 500);
});

test("withApiTrace returns a stable trace header on success and failure", async () => {
  const previousLevel = process.env.CIP_LOG_LEVEL;
  const previousDb = process.env.CIP_LOG_DB_ENABLED;
  process.env.CIP_LOG_LEVEL = "fatal";
  process.env.CIP_LOG_DB_ENABLED = "false";

  try {
    const successHandler = withApiTrace({ subsystem: "test", operation: "test.success" }, async () => {
      return NextResponse.json({ ok: true });
    });
    const success = await successHandler(new Request("http://localhost/api/test"), {});
    assert.equal(success.status, 200);
    assert.ok(success.headers.get("x-cip-trace-id"));

    const failureHandler = withApiTrace({ subsystem: "test", operation: "test.failure" }, async () => {
      throw new CipError("Broken", { errorCode: "BROKEN", status: 409 });
    });
    const failure = await failureHandler(new Request("http://localhost/api/test", { headers: { "x-cip-trace-id": "trace-test" } }), {});
    const body = await failure.json();
    assert.equal(failure.status, 409);
    assert.equal(failure.headers.get("x-cip-trace-id"), "trace-test");
    assert.equal(body.traceId, "trace-test");
    assert.equal(body.errorCode, "BROKEN");
  } finally {
    if (previousLevel === undefined) {
      delete process.env.CIP_LOG_LEVEL;
    } else {
      process.env.CIP_LOG_LEVEL = previousLevel;
    }
    if (previousDb === undefined) {
      delete process.env.CIP_LOG_DB_ENABLED;
    } else {
      process.env.CIP_LOG_DB_ENABLED = previousDb;
    }
  }
});


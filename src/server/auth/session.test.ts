import assert from "node:assert/strict";
import test from "node:test";

import { destinationForProjectPresence, destinationForRole } from "@/server/auth/session";

test("routes operators to admin regardless of project count", () => {
  assert.equal(destinationForRole("platform_owner", "zh-CN"), "/zh-CN/admin");
  assert.equal(destinationForProjectPresence("platform_owner", "zh-CN", 0), "/zh-CN/admin");
  assert.equal(destinationForProjectPresence("operator_admin", "en", 12), "/en/admin");
});

test("routes customer users to projects list when they already have projects", () => {
  assert.equal(destinationForProjectPresence("customer_owner", "zh-CN", 1), "/zh-CN/app/projects");
  assert.equal(destinationForProjectPresence("customer_member", "en", 3), "/en/app/projects");
});

test("routes customer users to project creation when they have no projects", () => {
  assert.equal(destinationForProjectPresence("customer_owner", "zh-CN", 0), "/zh-CN/app/projects/new");
  assert.equal(destinationForProjectPresence("customer_member", "en", 0), "/en/app/projects/new");
});

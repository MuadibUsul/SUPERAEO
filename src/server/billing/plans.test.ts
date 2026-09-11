import assert from "node:assert/strict";
import test from "node:test";

import { applyLimitOverrides, PLANS, UNLIMITED } from "@/server/billing/plans";

test("organization limit overrides replace only valid quota values", () => {
  assert.deepEqual(
    applyLimitOverrides(PLANS.pro.limits, { projects: UNLIMITED, auditsPerMonth: -1, seats: "unlimited" }),
    { ...PLANS.pro.limits, projects: UNLIMITED },
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { evidenceGrade, supportStatus } from "./evidence-service";

test("evidence gates refuse strong claims below thresholds", () => {
  assert.equal(evidenceGrade(19, [19]), "INSUFFICIENT");
  assert.equal(evidenceGrade(20, [20]), "DIRECTIONAL");
  assert.equal(evidenceGrade(40, [20, 20]), "CORROBORATED");
  assert.equal(supportStatus(19, 0, 19), "INSUFFICIENT");
  assert.equal(supportStatus(15, 5, 20), "MIXED");
});

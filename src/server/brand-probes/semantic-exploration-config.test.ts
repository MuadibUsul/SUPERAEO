import assert from "node:assert/strict";
import test from "node:test";

import { getSemanticExplorationConfig } from "@/server/brand-probes/semantic-exploration-service";

test("defaults to 360 seed plus at most 640 adaptive probes with finite budgets", () => {
  const names = [
    "SEMANTIC_EXPLORATION_MAX_ITERATIONS",
    "SEMANTIC_EXPLORATION_MAX_ADDITIONAL_PROBES",
    "SEMANTIC_EXPLORATION_PROBES_PER_ITERATION",
    "SEMANTIC_EXPLORATION_MAX_TOKENS",
    "SEMANTIC_EXPLORATION_MAX_COST",
    "SEMANTIC_EXPLORATION_MAX_DURATION_MS",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  names.forEach((name) => delete process.env[name]);
  try {
    const config = getSemanticExplorationConfig(true);
    assert.equal(config.maxIterations, 41);
    assert.equal(config.maxAdditionalProbes, 640);
    assert.equal(config.probesPerIteration, 16);
    assert.equal(config.maxTokens, 1_000_000);
    assert.equal(config.maxCost, 2);
    assert.equal(config.maxDurationMs, 14_400_000);
  } finally {
    names.forEach((name) => restoreEnv(name, previous.get(name)));
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

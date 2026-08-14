import assert from "node:assert/strict";
import test from "node:test";

import { allocateUsageAcrossProbes, usageNumbers } from "@/server/brand-probes/token-cost";

test("estimates USD cost and allocates micro-batch usage once across probes", () => {
  const previousInput = process.env.SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION;
  const previousOutput = process.env.SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION;
  process.env.SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION = "1";
  process.env.SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION = "2";
  try {
    const usage = usageNumbers({ prompt_tokens: 1_000, completion_tokens: 500, total_tokens: 1_500 });
    const perProbe = allocateUsageAcrossProbes(usage, 5);
    assert.equal(usage.estimatedCostUsd, 0.002);
    assert.equal(perProbe.totalTokens, 300);
    assert.equal(perProbe.estimatedCostUsd, 0.0004);
  } finally {
    restoreEnv("SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION", previousInput);
    restoreEnv("SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION", previousOutput);
  }
});

test("uses DeepSeek rates for the active compatibility model and a conservative unknown-model fallback", () => {
  const previousInput = process.env.SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION;
  const previousOutput = process.env.SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION;
  delete process.env.SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION;
  delete process.env.SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION;
  try {
    const usage = { promptTokens: 1_000, completionTokens: 500 };
    assert.equal(usageNumbers(usage, "deepseek-chat").estimatedCostUsd, 0.00028);
    assert.equal(usageNumbers(usage, "unknown-model").estimatedCostUsd, 0.015);
  } finally {
    restoreEnv("SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION", previousInput);
    restoreEnv("SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION", previousOutput);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

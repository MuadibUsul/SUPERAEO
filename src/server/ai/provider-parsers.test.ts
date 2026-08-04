import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anthropicText,
  chatCompletionText,
  geminiText,
  openAIResponseText,
  usageFromOpenAI,
} from "@/server/ai/provider-parsers";

test("openAIResponseText prefers output_text", () => {
  assert.equal(openAIResponseText({ output_text: "hello" }), "hello");
});

test("openAIResponseText falls back to nested output content", () => {
  const raw = { output: [{ content: [{ text: "nested" }] }] };
  assert.equal(openAIResponseText(raw), "nested");
});

test("chatCompletionText reads choices[0].message.content", () => {
  const raw = { choices: [{ message: { content: "answer" } }] };
  assert.equal(chatCompletionText(raw), "answer");
});

test("anthropicText joins every text block and drops non-text parts", () => {
  const raw = { content: [{ type: "text", text: "a" }, { type: "tool_use" }, { type: "text", text: "b" }] };
  assert.equal(anthropicText(raw), "a\nb");
});

test("geminiText reads candidates[0].content.parts[0].text", () => {
  const raw = { candidates: [{ content: { parts: [{ text: "gem" }] } }] };
  assert.equal(geminiText(raw), "gem");
});

test("usageFromOpenAI accepts both Responses and chat-completions field names", () => {
  assert.deepEqual(usageFromOpenAI({ usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 } }), {
    promptTokens: 3,
    completionTokens: 5,
    totalTokens: 8,
  });
  assert.deepEqual(usageFromOpenAI({ usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }), {
    promptTokens: 1,
    completionTokens: 2,
    totalTokens: 3,
  });
});

test("every parser is defensive against malformed / empty payloads", () => {
  for (const bad of [null, undefined, {}, [], "nope", 42, { output: "x" }, { choices: [] }]) {
    assert.equal(typeof openAIResponseText(bad), "string");
    assert.equal(typeof chatCompletionText(bad), "string");
    assert.equal(typeof anthropicText(bad), "string");
    assert.equal(typeof geminiText(bad), "string");
  }
  // undefined per-field means "omit", not NaN
  assert.deepEqual(usageFromOpenAI({}), {
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
  });
});

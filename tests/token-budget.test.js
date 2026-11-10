import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isReasoningRequest,
  parseRequestedTokens,
  effectiveMaxTokens,
  MIN_ANSWER_TOKENS,
  THINKING_BUDGET,
  MIN_PLAIN_TOKENS,
} from "../src/catalog/token-budget.js";

test("Token Budget - parseRequestedTokens parses various inputs", () => {
  assert.equal(parseRequestedTokens(undefined), 131072);
  assert.equal(parseRequestedTokens(null), 131072);
  assert.equal(parseRequestedTokens(true), 131072);
  assert.equal(parseRequestedTokens(""), 131072);
  assert.equal(parseRequestedTokens(-5), 131072);
  assert.equal(parseRequestedTokens(100), 100);
  assert.equal(parseRequestedTokens("4096"), 4096);
});

test("Token Budget - isReasoningRequest identifies reasoning requests", () => {
  assert.equal(isReasoningRequest({}, { reasoning: true }), true);
  assert.equal(isReasoningRequest({}, { reasoning: false }), false);
  assert.equal(isReasoningRequest({ reasoning_effort: "high" }, null), true);
  assert.equal(isReasoningRequest({ reasoning_effort: "none" }, null), false);
  assert.equal(isReasoningRequest({}, null), false);
});

test("Token Budget - effectiveMaxTokens applies additive formula for reasoning models", () => {
  const reasoningModel = { id: "beam-free", reasoning: true, maxTokens: 131072 };

  // Small client request (e.g. 50 tokens) must be elevated so thinking tokens don't exhaust the budget
  const smallBudget = effectiveMaxTokens(50, reasoningModel, {});
  assert.equal(smallBudget, MIN_ANSWER_TOKENS + THINKING_BUDGET); // 1024 + 4096 = 5120

  // Larger client request (e.g. 8000 tokens) adds THINKING_BUDGET
  const largeBudget = effectiveMaxTokens(8000, reasoningModel, {});
  assert.equal(largeBudget, 8000 + THINKING_BUDGET); // 12096

  // Clamped to ceiling
  const cappedModel = { id: "capped-free", reasoning: true, maxTokens: 4000 };
  const clampedBudget = effectiveMaxTokens(50, cappedModel, {});
  assert.equal(clampedBudget, 4000);
});

test("Token Budget - effectiveMaxTokens applies plain model floor and ceiling", () => {
  const plainModel = { id: "big-pickle", reasoning: false, maxTokens: 16384 };

  // Small request gets elevated to MIN_PLAIN_TOKENS (512)
  assert.equal(effectiveMaxTokens(50, plainModel, {}), MIN_PLAIN_TOKENS);

  // Normal request passes through
  assert.equal(effectiveMaxTokens(2048, plainModel, {}), 2048);

  // Clamped to ceiling
  assert.equal(effectiveMaxTokens(50000, plainModel, {}), 16384);
});

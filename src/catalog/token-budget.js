/**
 * Token budgeting for reasoning and standard models.
 * Ported and adapted from opencode-free-bridge.
 *
 * Reasoning models (MiMo, Nemotron, Crouton, Pulse, DeepSeek, etc.) emit
 * chain-of-thought tokens that count against the SAME output budget as the
 * visible answer. When a client requests a small max_tokens (e.g. 100, 256),
 * the model spends its whole budget thinking and returns finish_reason: "length"
 * with empty content.
 *
 * The solution is an additive budget formula:
 *   max_tokens = max(requested, 1024) + 4096 (thinking budget)
 *
 * For non-reasoning models, a floor of 512 is applied so tiny client budgets
 * do not truncate normal answers mid-sentence.
 */

export const MIN_ANSWER_TOKENS = 1024;
export const THINKING_BUDGET = 4096;
export const MAX_OUTPUT_TOKENS = 131_072;
export const MIN_PLAIN_TOKENS = 512;

export function isReasoningRequest(body, modelDef) {
  if (modelDef && typeof modelDef.reasoning === "boolean") {
    if (modelDef.reasoning) return true;
  }
  const effort = body?.reasoning_effort;
  return Boolean(effort) && effort !== "none";
}

export function parseRequestedTokens(requested) {
  if (requested === undefined || requested === null || typeof requested === "boolean") {
    return MAX_OUTPUT_TOKENS;
  }
  if (typeof requested === "string" && requested.trim() === "") {
    return MAX_OUTPUT_TOKENS;
  }
  const raw = Number(requested);
  if (!Number.isFinite(raw) || raw < 0) {
    return MAX_OUTPUT_TOKENS;
  }
  return Math.floor(raw);
}

export function effectiveMaxTokens(requested, modelDef, body) {
  const wanted = parseRequestedTokens(requested);

  const effective = isReasoningRequest(body, modelDef)
    ? Math.max(wanted, MIN_ANSWER_TOKENS) + THINKING_BUDGET
    : Math.max(wanted, MIN_PLAIN_TOKENS);

  const ceiling = (modelDef && modelDef.maxTokens > 0) ? modelDef.maxTokens : MAX_OUTPUT_TOKENS;
  return Math.min(effective, ceiling);
}

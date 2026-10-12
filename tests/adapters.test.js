import test from "node:test";
import assert from "node:assert/strict";
import {
  transformOpencodeBody,
  opencodeHeaders,
  OPENCODE_FINGERPRINT_TOOLS,
} from "../src/adapters/opencode-zen.js";

test("OpenCode Zen Adapter - Chat Completions transform", () => {
  const reqBody = {
    model: "nemotron-3-ultra-free",
    messages: [{ role: "user", content: "Hello" }],
    stream: false,
  };

  const transformed = transformOpencodeBody(reqBody);

  // Must force stream: true for OpenCode gate
  assert.equal(transformed.stream, true);

  // Must inject the full fingerprint sextet
  assert.ok(Array.isArray(transformed.tools));
  const toolNames = transformed.tools.map((t) => t.function?.name || t.name);
  for (const toolName of OPENCODE_FINGERPRINT_TOOLS) {
    assert.ok(toolNames.includes(toolName), `Missing required fingerprint tool: ${toolName}`);
  }

  // Must set tool_choice to "none" so decoys are never called
  assert.equal(transformed.tool_choice, "none");
});

test("OpenCode Zen Adapter - Muse Responses transform", () => {
  const reqBody = {
    model: "muse-spark-1.3-contributor-free",
    input: [
      { type: "message", role: "user", content: "Hi" },
      { type: "reasoning", encrypted_content: "xyz" },
    ],
    max_tokens: 4096,
  };

  const transformed = transformOpencodeBody(reqBody);

  // Must set store: false
  assert.equal(transformed.store, false);

  // Must convert max_tokens to max_output_tokens
  assert.equal(transformed.max_output_tokens, 4096);
  assert.equal(transformed.max_tokens, undefined);

  // Must strip prior reasoning turn
  assert.equal(transformed.input.length, 1);
  assert.equal(transformed.input[0].type, "message");

  // Must have fingerprint tools injected into tools array
  assert.ok(Array.isArray(transformed.tools));
  const toolNames = transformed.tools.map((t) => t.name || t.function?.name);
  for (const toolName of OPENCODE_FINGERPRINT_TOOLS) {
    assert.ok(toolNames.includes(toolName));
  }
});

test("OpenCode Zen Headers - Format and Distributed Tracing", () => {
  const headers = opencodeHeaders();
  assert.ok(headers["User-Agent"].startsWith("opencode/"));
  assert.equal(headers["Authorization"], "Bearer public");
  assert.equal(headers["x-opencode-client"], "desktop");
  assert.match(headers["x-opencode-session"], /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.match(headers["x-opencode-request"], /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.ok(headers["b3"]);
  assert.ok(headers["traceparent"]);
});

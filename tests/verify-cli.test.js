import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { assembleSse } from "../src/verify.js";
import { handleRequest } from "../src/router.js";

test("Verify CLI - assembleSse folds SSE stream into completion object", () => {
  const sseRaw = [
    'data: {"choices":[{"delta":{"content":"function add(a, b) {"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":" return a + b; }"}}]}',
    "",
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"completion_tokens":12}}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  const result = assembleSse(sseRaw);
  assert.equal(result.choices[0].message.content, "function add(a, b) { return a + b; }");
  assert.equal(result.choices[0].finish_reason, "stop");
  assert.equal(result.usage.completion_tokens, 12);
});

test("Verify CLI - assembleSse extracts reasoning_content", () => {
  const sseRaw = [
    'data: {"choices":[{"delta":{"reasoning_content":"Let me calculate..."}}]}',
    "",
    'data: {"choices":[{"delta":{"content":"Answer: 42"}}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  const result = assembleSse(sseRaw);
  assert.equal(result.choices[0].message.reasoning_content, "Let me calculate...");
  assert.equal(result.choices[0].message.content, "Answer: 42");
});

test("Verify CLI - /health endpoint returns server runtime and status", async () => {
  const server = http.createServer((req, res) => handleRequest(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.ok(body.runtime.startsWith("node/"));
    assert.equal(typeof body.models, "number");
    assert.ok(body.models > 0);
  } finally {
    server.close();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  transformOpencodeBody,
  opencodeHeaders,
  restoreToolAliases,
  getOpenCodeUA,
  OPENCODE_EXACT_TOOLS,
  OPENCODE_FINGERPRINT_TOOLS,
} from "../src/adapters/opencode-zen.js";

test("OpenCode Zen Adapter - Chat Completions transform (v2 gate)", () => {
  const reqBody = {
    model: "nemotron-3-ultra-free",
    messages: [{ role: "user", content: "Hello" }],
    stream: false,
    tools: [
      {
        type: "function",
        function: {
          name: "bash",
          description: "Run custom command",
          parameters: { type: "object", properties: { cmd: { type: "string" } } },
        },
      },
      {
        type: "function",
        function: {
          name: "my_custom_tool",
          description: "Custom user tool",
          parameters: { type: "object", properties: {} },
        },
      },
    ],
  };

  const { body, responsesPath } = transformOpencodeBody(reqBody);

  // Must force stream: true for OpenCode gate
  assert.equal(body.stream, true);
  assert.equal(responsesPath, false);

  // Must inject exact read and shell fingerprint tools
  assert.ok(Array.isArray(body.tools));
  const toolNames = body.tools.map((t) => t.function?.name || t.name);
  for (const toolName of OPENCODE_FINGERPRINT_TOOLS) {
    assert.ok(toolNames.includes(toolName), `Missing required fingerprint tool: ${toolName}`);
  }

  // Caller tool named "bash" must be aliased to "bash_pi" to prevent collisions
  assert.ok(toolNames.includes("bash_pi"));
  assert.ok(!toolNames.includes("bash"));
  assert.ok(toolNames.includes("my_custom_tool"));
  assert.equal(body.__bansosToolAliases?.["bash_pi"], "bash");

  // tool_choice should NOT be forced to "none" in v2 gate
  assert.notEqual(body.tool_choice, "none");
});

test("OpenCode Zen Adapter - Tool Alias Restoration", () => {
  const aliases = { bash_pi: "bash", read_pi: "read" };
  const rawText = '{"tool_calls":[{"function":{"name":"bash_pi","arguments":"ls -la"}}]}';
  const restored = restoreToolAliases(rawText, aliases);
  assert.equal(restored, '{"tool_calls":[{"function":{"name":"bash","arguments":"ls -la"}}]}');
});

test("OpenCode Zen Adapter - Muse Responses transform (v2 gate)", () => {
  const reqBody = {
    model: "muse-spark-1.3-contributor-free",
    input: [
      { type: "message", role: "user", content: "Hi" },
      { type: "reasoning", encrypted_content: "xyz" },
    ],
    max_tokens: 4096,
  };

  const { body, responsesPath } = transformOpencodeBody(reqBody);

  assert.equal(responsesPath, true);
  // Must set store: false
  assert.equal(body.store, false);

  // Must convert max_tokens to max_output_tokens
  assert.equal(body.max_output_tokens, 4096);
  assert.equal(body.max_tokens, undefined);

  // Must strip prior reasoning turn
  assert.equal(body.input.length, 1);
  assert.equal(body.input[0].type, "message");

  // Must have fingerprint tools injected into tools array
  assert.ok(Array.isArray(body.tools));
  const toolNames = body.tools.map((t) => t.name || t.function?.name);
  for (const toolName of OPENCODE_FINGERPRINT_TOOLS) {
    assert.ok(toolNames.includes(toolName));
  }
});

test("OpenCode Zen Headers - Format and Distributed Tracing (Inference vs Catalog)", () => {
  // Inference headers: withRequestHeader = false
  const infHeaders = opencodeHeaders(false);
  assert.ok(infHeaders["User-Agent"].startsWith("opencode/"));
  assert.equal(infHeaders["Authorization"], "Bearer public");
  assert.equal(infHeaders["x-opencode-client"], "desktop");
  assert.match(infHeaders["x-opencode-session"], /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.equal(infHeaders["x-opencode-session-id"], infHeaders["x-opencode-session"]);
  assert.equal(infHeaders["x-opencode-request"], undefined);
  assert.ok(infHeaders["b3"]);
  assert.ok(infHeaders["traceparent"]);

  // Catalog headers: withRequestHeader = true
  const catHeaders = opencodeHeaders(true);
  assert.match(catHeaders["x-opencode-request"], /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.equal(catHeaders["x-opencode-session-id"], catHeaders["x-opencode-session"]);

  // User-Agent version check
  const ua = getOpenCodeUA();
  assert.match(ua, /^opencode\/\d+\.\d+\.\d+$/);
});

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer, stopServer } from "../src/server.js";
import { getLocalApiKey } from "../src/auth/local-auth.js";
import { config } from "../src/config.js";

test("Mock Upstream - Chat completions end-to-end tests", async (t) => {
  // 1. Create Mock Upstream Server
  const mockUpstream = http.createServer((req, res) => {
    if (req.url === "/api/gateway/chat/completions" || req.url?.includes("/zen/v1/chat/completions")) {
      const isStream = req.headers["accept"] === "text/event-stream" || true;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      res.write('data: {"id":"msg_123","choices":[{"delta":{"role":"assistant","content":"Mocked "},"index":0}]}\n\n');
      res.write('data: {"id":"msg_123","choices":[{"delta":{"content":"Response"},"index":0}]}\n\n');
      res.write('data: {"id":"msg_123","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n');
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => mockUpstream.listen(18995, "127.0.0.1", resolve));

  // Point config to mock upstream
  const originalKilo = config.kiloChatUrl;
  const originalZen = config.upstreamOpenCode;
  config.kiloChatUrl = "http://127.0.0.1:18995/api/gateway/chat/completions";
  config.upstreamOpenCode = "http://127.0.0.1:18995/zen";

  // 2. Start Test Server
  const { server, port, host } = await startServer(18991);
  const baseUrl = `http://${host}:${port}`;
  const apiKey = getLocalApiKey();

  t.after(async () => {
    await stopServer(server);
    await new Promise((resolve) => mockUpstream.close(resolve));
    config.kiloChatUrl = originalKilo;
    config.upstreamOpenCode = originalZen;
  });

  // Test Non-streaming request to Kilo model
  const nonStreamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "kilo-auto/free",
      messages: [{ role: "user", content: "Test non-stream" }],
      stream: false,
    }),
  });

  assert.equal(nonStreamRes.status, 200);
  const nonStreamData = await nonStreamRes.json();
  assert.equal(nonStreamData.object, "chat.completion");
  assert.equal(nonStreamData.choices[0].message.content, "Mocked Response");
  assert.equal(nonStreamData.choices[0].finish_reason, "stop");

  // Test Streaming request to OpenCode model
  const streamRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nemotron-3-ultra-free",
      messages: [{ role: "user", content: "Test stream" }],
      stream: true,
    }),
  });

  assert.equal(streamRes.status, 200);
  assert.ok(streamRes.headers.get("content-type")?.includes("text/event-stream"));
  const text = await streamRes.text();
  assert.ok(text.includes("Mocked "));
  assert.ok(text.includes("Response"));
  assert.ok(text.includes("[DONE]"));
});

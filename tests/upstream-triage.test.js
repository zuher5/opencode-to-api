import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startServer, stopServer } from "../src/server.js";
import { getLocalApiKey } from "../src/auth/local-auth.js";
import { config } from "../src/config.js";
import { upstreamHealth } from "../src/proxy/upstream-health.js";
import { setRelayEnabled, getRelayStats } from "../src/proxy/relay.js";

const quota429 =
  '{"type":"error","error":{"type":"FreeUsageLimitError","message":"Free usage limit reached."}}';
const ipFlag403 =
  '{"type":"error","error":{"type":"FreeTierError","message":"OpenCode\'s free models aren\'t available from your current network because we\'ve detected abusive traffic from this IP address."}}';

test("Upstream triage - cooldown fails fast without hitting upstream", async (t) => {
  let upstreamHits = 0;
  let mode = "quota";

  const mockUpstream = http.createServer((req, res) => {
    upstreamHits++;
    if (mode === "quota") {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "120" });
      res.end(quota429);
      return;
    }
    res.writeHead(403, { "content-type": "application/json" });
    res.end(ipFlag403);
  });

  await new Promise((resolve) => mockUpstream.listen(18996, "127.0.0.1", resolve));

  const originalInference = config.upstreamOpenCodeInference;
  config.upstreamOpenCodeInference = "http://127.0.0.1:18996/inference/v1";

  const { server, port, host } = await startServer(18992);
  const baseUrl = `http://${host}:${port}`;
  const apiKey = getLocalApiKey();

  // Quota/egress cooldowns are only recorded from direct egress, so pin the
  // relay off: a persisted relay-state.json must not change the expectation.
  const relayWasEnabled = getRelayStats().enabled;
  setRelayEnabled(false);
  upstreamHealth.reset();

  t.after(async () => {
    await stopServer(server);
    await new Promise((resolve) => mockUpstream.close(resolve));
    config.upstreamOpenCodeInference = originalInference;
    setRelayEnabled(relayWasEnabled);
    upstreamHealth.reset();
  });

  const post = (model) =>
    fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
    });

  // 1. First quota 429 reaches the upstream and records a cooldown.
  const first = await post("beam-free");
  assert.equal(first.status, 429);
  assert.equal(upstreamHits, 1);
  assert.ok(Number(first.headers.get("retry-after")) > 0);
  assert.equal(upstreamHealth.cooldown("opencode", "beam-free")?.kind, "quota");

  // 2. Second identical request fails fast: no new upstream hit.
  const second = await post("beam-free");
  assert.equal(second.status, 429);
  assert.equal(upstreamHits, 1, "cooldown must not replay the refusal upstream");
  const secondBody = await second.json();
  assert.equal(secondBody.error?.code, "quota_exhausted");
  assert.match(secondBody.error?.message, /quota/i);

  // 3. A different model is unaffected.
  const other = await post("big-pickle");
  assert.equal(other.status, 429);
  assert.equal(upstreamHits, 2, "other model must reach the upstream");

  // 4. IP-flag 403 cools the whole upstream and fails fast with 503.
  mode = "ip-flagged";
  upstreamHealth.reset();
  const flagged = await post("big-pickle");
  assert.equal(flagged.status, 403);
  assert.equal(upstreamHits, 3);

  const afterFlag = await post("beam-free");
  assert.equal(afterFlag.status, 503);
  assert.equal(upstreamHits, 3, "egress cooldown must cover every model");
  const flagBody = await afterFlag.json();
  assert.equal(flagBody.error?.code, "egress_ip_flagged");
  assert.match(flagBody.error?.message, /relay/i);
});

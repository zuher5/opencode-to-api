import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  addRelay,
  removeRelay,
  setRelayEnabled,
  relayFetch,
  responseVia,
  getRelayDetails,
  OPENCODE_CIPHER_LIST,
} from "../src/proxy/relay.js";
import { deployVercelRelay, deployCloudflareRelay } from "../src/proxy/relay-deploy.js";

test("Relay - auth header propagation, 403 failover, and responseVia", async (t) => {
  const requests = [];
  let server1Status = 403;

  // Mock relay server 1: returns 403 to trigger failover
  const server1 = http.createServer((req, res) => {
    requests.push({ server: 1, headers: req.headers });
    res.writeHead(server1Status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "ip flagged or forbidden" }));
  });

  // Mock relay server 2: verifies x-relay-auth and succeeds
  const server2 = http.createServer((req, res) => {
    requests.push({ server: 2, headers: req.headers });
    if (req.headers["x-relay-auth"] === "test-auth-secret") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, source: "relay2" }));
    } else {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad auth" }));
    }
  });

  await new Promise((resolve) => server1.listen(0, "127.0.0.1", resolve));
  await new Promise((resolve) => server2.listen(0, "127.0.0.1", resolve));

  const url1 = `http://127.0.0.1:${server1.address().port}`;
  const url2 = `http://127.0.0.1:${server2.address().port}`;

  t.after(async () => {
    setRelayEnabled(false);
    removeRelay(url1);
    removeRelay(url2);
    await new Promise((resolve) => server1.close(resolve));
    await new Promise((resolve) => server2.close(resolve));
  });

  addRelay(url1, "Relay 1", "");
  addRelay(url2, "Relay 2", "test-auth-secret");
  setRelayEnabled(true);

  const res = await relayFetch("https://api.kilo.ai/test-endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);

  // Relay 1 returned 403 so it must have rolled over to Relay 2
  assert.equal(responseVia.get(res), url2);

  const req2 = requests.find((r) => r.server === 2);
  assert.ok(req2, "Server 2 should have received request");
  assert.equal(req2.headers["x-relay-auth"], "test-auth-secret");
  assert.equal(req2.headers["x-relay-target"], "https://api.kilo.ai");
  assert.equal(req2.headers["x-relay-path"], "/test-endpoint");
});

test("Relay deploy - validation and mock deployment flow", async () => {
  assert.equal(typeof deployVercelRelay, "function");
  assert.equal(typeof deployCloudflareRelay, "function");

  // Test Vercel deploy flow with mocked fetch
  const originalFetch = globalThis.fetch;
  try {
    let callCount = 0;
    globalThis.fetch = async (url, opts) => {
      callCount++;
      const urlStr = String(url);
      if (urlStr.includes("api.vercel.com/v13/deployments") && opts.method === "POST") {
        return new Response(JSON.stringify({ id: "dep_123", projectId: "proj_123" }), { status: 200 });
      }
      if (urlStr.includes("api.vercel.com/v9/projects/proj_123")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (urlStr.includes("api.vercel.com/v13/deployments/dep_123")) {
        return new Response(JSON.stringify({ readyState: "READY", url: "test-relay.vercel.app" }), { status: 200 });
      }
      if (urlStr.includes("api.cloudflare.com/client/v4/accounts") && !urlStr.includes("workers")) {
        return new Response(JSON.stringify({ result: [{ id: "acc_123" }] }), { status: 200 });
      }
      if (urlStr.includes("workers/scripts") && opts.method === "PUT") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes("subdomain") && opts.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (urlStr.includes("workers/subdomain") && (!opts?.method || opts.method === "GET")) {
        return new Response(JSON.stringify({ result: { subdomain: "user-test" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    };

    const vercelUrl = await deployVercelRelay("test-token", "test-name");
    assert.equal(vercelUrl, "https://test-relay.vercel.app");

    const cfResult = await deployCloudflareRelay("test-token", "test-name");
    assert.ok(cfResult.url.includes(".user-test.workers.dev"));
    assert.ok(typeof cfResult.auth === "string" && cfResult.auth.length === 64);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Relay - direct OpenCode fetch marks responseVia direct and passes JA4 ciphers", async () => {
  const originalRequest = https.request;
  try {
    let capturedOpts = null;
    https.request = (opts, callback) => {
      capturedOpts = opts;
      const res = Readable.from([Buffer.from(JSON.stringify({ ok: true }))]);
      res.statusCode = 200;
      res.statusMessage = "OK";
      res.headers = { "content-type": "application/json" };
      process.nextTick(() => {
        callback(res);
      });
      const req = new EventEmitter();
      req.end = () => {};
      req.destroy = () => {};
      return req;
    };

    setRelayEnabled(false);
    const res = await relayFetch("https://opencode.ai/inference/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    assert.equal(res.status, 200);
    assert.equal(responseVia.get(res), "direct");
    assert.equal(capturedOpts.hostname, "opencode.ai");
    assert.equal(capturedOpts.ciphers, OPENCODE_CIPHER_LIST);
    assert.equal(capturedOpts.agent, false);
    const data = await res.json();
    assert.deepEqual(data, { ok: true });
  } finally {
    https.request = originalRequest;
  }
});

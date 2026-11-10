import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  redactProxyUrl,
  validateProxyUrl,
  setProxyConfig,
  getProxyDetails,
  selectActiveProxy,
  forwardProxyFetch,
} from "../src/proxy/forward-proxy.js";

test("Forward Proxy - redactProxyUrl masks credentials", () => {
  assert.equal(redactProxyUrl("http://user:secret123@127.0.0.1:8080"), "http://***:***@127.0.0.1:8080");
  assert.equal(redactProxyUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
  assert.equal(redactProxyUrl(""), "");
});

test("Forward Proxy - validateProxyUrl accepts http/https and rejects socks5", () => {
  assert.equal(validateProxyUrl("http://127.0.0.1:8080"), "http://127.0.0.1:8080/");
  assert.equal(validateProxyUrl("https://proxy.example.com"), "https://proxy.example.com/");
  assert.throws(() => validateProxyUrl("socks5://127.0.0.1:1080"), /Unsupported proxy protocol/);
  assert.throws(() => validateProxyUrl(""), /cannot be empty/);
});

test("Forward Proxy - state configuration and pool selection", () => {
  setProxyConfig({
    enabled: true,
    url: "http://127.0.0.1:8081",
    pool: ["http://127.0.0.1:8082", "http://127.0.0.1:8083"],
    strategy: "failover",
  });

  const details = getProxyDetails();
  assert.equal(details.enabled, true);
  assert.equal(details.rawUrl, "http://127.0.0.1:8081");
  assert.equal(details.pool.length, 2);

  // In failover strategy, primary candidate is chosen
  const selected = selectActiveProxy();
  assert.equal(selected, "http://127.0.0.1:8081");

  // Disable proxy
  setProxyConfig({ enabled: false });
  assert.equal(selectActiveProxy(), null);
});

test("Forward Proxy - direct HTTP proxy request forwarding", async () => {
  let proxyHit = false;
  let targetHit = false;

  // 1. Create target server
  const targetServer = http.createServer((req, res) => {
    targetHit = true;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ target: "ok" }));
  });
  await new Promise((r) => targetServer.listen(0, "127.0.0.1", r));
  const targetPort = targetServer.address().port;

  // 2. Create mock HTTP forward proxy
  const proxyServer = http.createServer((req, res) => {
    proxyHit = true;
    // Proxy forwards to target
    const proxyReq = http.request(
      req.url,
      {
        method: req.method,
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );
    req.pipe(proxyReq);
  });
  await new Promise((r) => proxyServer.listen(0, "127.0.0.1", r));
  const proxyPort = proxyServer.address().port;

  try {
    const proxyUrl = `http://127.0.0.1:${proxyPort}`;
    const targetUrl = `http://127.0.0.1:${targetPort}/test`;

    const res = await forwardProxyFetch(targetUrl, { method: "GET" }, proxyUrl);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.target, "ok");
    assert.equal(proxyHit, true);
    assert.equal(targetHit, true);
  } finally {
    targetServer.close();
    proxyServer.close();
  }
});

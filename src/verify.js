#!/usr/bin/env node
/**
 * verify.js — CLI readiness self-check for opencode-to-api.
 *
 * Checks if the local bridge is running, healthy, and able to complete
 * chat requests through the configured egress (direct, relay, or forward proxy).
 *
 * Usage:
 *   node src/verify.js          full check: tests models with real prompt
 *   node src/verify.js --quick  quick check: stops at first successful response
 */

import http from "node:http";

const PORT = parseInt(process.env.PORT || "20128", 10);
const RAW_HOST = process.env.HOST || "127.0.0.1";
const HOST = RAW_HOST === "0.0.0.0" || RAW_HOST === "::" ? "127.0.0.1" : RAW_HOST;
const BASE = `http://${HOST}:${PORT}`;
const API_KEY = process.env.LOCAL_API_KEY || process.env.OPENAI_API_KEY || "sk-2004";
const QUICK = process.argv.includes("--quick");

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const ok = (s) => `${C.green}${s}${C.reset}`;
const warn = (s) => `${C.yellow}${s}${C.reset}`;
const bad = (s) => `${C.red}${s}${C.reset}`;

export function assembleSse(raw) {
  let content = "";
  let reasoning = "";
  let finish = null;
  let usage = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const chunk = line.slice(5).trim();
    if (!chunk || chunk === "[DONE]") continue;
    let ev = null;
    try {
      ev = JSON.parse(chunk);
    } catch {
      continue;
    }
    if (ev?.error) return { error: ev.error };
    const choice = ev?.choices?.[0];
    if (choice?.delta?.content) content += choice.delta.content;
    if (choice?.delta?.reasoning_content) reasoning += choice.delta.reasoning_content;
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (ev?.usage) usage = ev.usage;
  }
  return {
    choices: [{ message: { role: "assistant", content, reasoning_content: reasoning }, finish_reason: finish }],
    usage,
  };
}

function request(method, path, body = null, timeoutMs = QUICK ? 25000 : 120000) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      Authorization: `Bearer ${API_KEY}`,
    };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch {}
          if (!parsed && /^\s*data:/.test(data)) {
            parsed = assembleSse(data);
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        });
      }
    );

    req.on("error", (err) => resolve({ status: 0, error: err.code || err.message }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function checkHealth() {
  const res = await request("GET", "/health", null, 10000);
  if (res.status !== 200 || !res.body) {
    return { ok: false, detail: res.error || `HTTP ${res.status}` };
  }
  return {
    ok: true,
    version: res.body.version,
    runtime: res.body.runtime || null,
    models: res.body.models,
    relay: res.body.relay || null,
    proxy: res.body.proxy || null,
  };
}

async function listModels() {
  const res = await request("GET", "/v1/models", null, 15000);
  if (res.status !== 200 || !res.body?.data) return [];
  return res.body.data.map((m) => m.id);
}

async function probe(model) {
  const started = Date.now();
  const res = await request("POST", "/v1/chat/completions", {
    model,
    messages: [
      {
        role: "user",
        content: QUICK ? "Say OK" : "Write a Python function `add(a,b)` that returns their sum. Output code only.",
      },
    ],
    max_tokens: QUICK ? 100 : 1024,
    stream: true,
  });
  const ms = Date.now() - started;

  if (res.status === 429) return { state: "ratelimited", ms };
  if (res.status === 403) {
    const msg = String(res.body?.error?.message || res.error || "");
    return { state: "gate-closed", ms, detail: msg.slice(0, 90) };
  }
  if (res.status !== 200) {
    const msg = res.body?.error?.message || res.error || `HTTP ${res.status}`;
    return { state: "failed", ms, detail: msg.slice(0, 70) };
  }

  const message = res.body?.choices?.[0]?.message;
  const content = (message?.content || "").trim();
  const reasoning = (message?.reasoning_content || "").trim();

  if (!content && reasoning) {
    return { state: "thinking-only", ms, detail: `${reasoning.length} chars of reasoning, no answer` };
  }
  if (!content) return { state: "empty", ms };
  return { state: "ok", ms, chars: content.length, outTokens: res.body?.usage?.completion_tokens };
}

export async function runVerify() {
  console.log(`\n${C.bold}opencode-to-api — readiness self-check${C.reset}`);
  console.log(`${C.dim}${BASE}${C.reset}\n`);

  const health = await checkHealth();
  if (!health.ok) {
    console.log(`  ${bad("FAIL")} bridge not reachable at ${BASE}: ${health.detail}`);
    console.log(`\n  Start it first:  ${C.cyan}npm start${C.reset}\n`);
    return 1;
  }

  console.log(`  ${ok("OK")}  bridge v${health.version} (${health.runtime}), ${health.models} models available`);

  if (health.relay?.enabled && health.relay?.url) {
    console.log(`  ${C.dim}egress: serverless relay (${health.relay.url})${C.reset}`);
  } else if (health.proxy?.enabled && health.proxy?.url) {
    console.log(`  ${C.dim}egress: forward proxy (${health.proxy.url})${C.reset}`);
  } else {
    console.log(`  ${C.dim}egress: direct (local machine IP)${C.reset}`);
  }
  console.log("");

  const models = await listModels();
  if (models.length === 0) {
    console.log(`  ${warn("WARN")} no models listed at /v1/models`);
    return 1;
  }

  const toProbe = QUICK ? models.slice(0, 3) : models;
  console.log(
    `  Probing ${toProbe.length}${QUICK && models.length > toProbe.length ? " of " + models.length : ""} models${
      QUICK ? " (quick — stops at the first success)" : ""
    }...\n`
  );

  const results = [];
  for (const model of toProbe) {
    const r = await probe(model);
    results.push({ model, ...r });
    const time = `${(r.ms / 1000).toFixed(1)}s`.padStart(6);
    if (r.state === "ok") {
      console.log(`  ${ok("OK")}   ${model.padEnd(38)} ${time}  ${C.dim}${r.chars} chars, ${r.outTokens ?? "?"} tokens${C.reset}`);
      if (QUICK) break;
    } else if (r.state === "ratelimited") {
      console.log(`  ${warn("BUSY")} ${model.padEnd(38)} ${time}  ${C.dim}upstream rate limit, cooldown active${C.reset}`);
      if (QUICK) break;
    } else if (r.state === "gate-closed") {
      console.log(`  ${warn("GATE")} ${model.padEnd(38)} ${time}  ${C.dim}${r.detail || "IP flagged / allowance spent"}${C.reset}`);
      if (QUICK) break;
    } else if (r.state === "thinking-only") {
      console.log(`  ${bad("THINK")} ${model.padEnd(38)} ${time}  ${C.dim}${r.detail}${C.reset}`);
    } else if (r.state === "empty") {
      console.log(`  ${bad("EMPTY")} ${model.padEnd(38)} ${time}`);
    } else {
      console.log(`  ${bad("FAIL")} ${model.padEnd(38)} ${time}  ${C.dim}${r.detail}${C.reset}`);
    }
  }

  const counts = results.reduce((acc, r) => ((acc[r.state] = (acc[r.state] || 0) + 1), acc), {});
  const usable = counts.ok || 0;
  const blocked = (counts["gate-closed"] || 0) + (counts.ratelimited || 0);
  const broken = (counts["thinking-only"] || 0) + (counts.empty || 0) + (counts.failed || 0);

  console.log(`\n${C.bold}Summary${C.reset}`);
  console.log(`  ${ok(String(usable))} usable, ${blocked} blocked by upstream, ${broken} broken`);

  if (usable > 0) {
    console.log(`\n  ${ok("Bridge is working.")} Point your OpenAI client at ${C.cyan}${BASE}/v1${C.reset}\n`);
    return 0;
  }

  if (blocked > 0 && broken === 0) {
    console.log(`\n  ${warn("Bridge is healthy, but upstream refused this egress IP.")}`);
    console.log(`  ${C.dim}Deploy a Cloudflare/Vercel relay in Web GUI or set UPSTREAM_PROXY_URL.${C.reset}\n`);
    return 2;
  }

  console.log(`\n  ${bad("No model answered.")} Check bridge logs for details.\n`);
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith("verify.js")) {
  runVerify().then((code) => process.exit(code));
}

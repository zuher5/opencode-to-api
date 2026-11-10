import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../utils/logger.js";

const DEFAULT_STRATEGY = "round-robin";
const STRATEGIES = new Set(["round-robin", "failover", "random"]);
const DEFAULT_COOLDOWN_MS = 120_000;
const MAX_COOLDOWN_MS = 1_800_000;

function getProxyStateFile() {
  return path.join(config.dataDir, "proxy.json");
}

export function redactProxyUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  try {
    const u = new URL(raw.trim());
    if (u.username || u.password) {
      return `${u.protocol}//${u.username ? "***:***@" : ""}${u.host}`;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export function validateProxyUrl(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("Proxy URL cannot be empty");
  }
  const clean = raw.trim();
  let u;
  try {
    u = new URL(clean);
  } catch {
    throw new Error(`Invalid proxy URL: ${clean}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Unsupported proxy protocol: ${u.protocol}. Only http:// and https:// are supported.`);
  }
  if (!u.hostname) {
    throw new Error("Proxy URL must include a hostname");
  }
  return u.toString();
}

const proxyCooldowns = new Map();
let poolIndex = 0;

export function isProxyHealthy(url) {
  if (!url) return true;
  const cooldownUntil = proxyCooldowns.get(url) || 0;
  return Date.now() >= cooldownUntil;
}

export function markProxySuccess(url) {
  if (!url) return;
  proxyCooldowns.delete(url);
}

export function markProxyFailure(url) {
  if (!url) return;
  const current = proxyCooldowns.get(url) || 0;
  const now = Date.now();
  let nextDuration = DEFAULT_COOLDOWN_MS;
  if (current > now) {
    const elapsed = current - now;
    nextDuration = Math.min(elapsed * 2, MAX_COOLDOWN_MS);
  }
  proxyCooldowns.set(url, now + nextDuration);
  log("warn", "Forward proxy cooling down", { proxy: redactProxyUrl(url), cooldownSec: Math.round(nextDuration / 1000) });
}

export function loadProxyState() {
  const envUrl = process.env.UPSTREAM_PROXY_URL;
  const envPool = process.env.UPSTREAM_PROXY_POOL;
  const envStrategy = process.env.UPSTREAM_PROXY_STRATEGY;

  let fileData = {};
  const filePath = getProxyStateFile();
  try {
    if (fs.existsSync(filePath)) {
      fileData = JSON.parse(fs.readFileSync(filePath, "utf8")) || {};
    }
  } catch {}

  const enabled = Boolean(envUrl || envPool || fileData.enabled);
  const url = (envUrl || fileData.url || "").trim();
  const pool = envPool
    ? envPool.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(fileData.pool)
    ? fileData.pool
    : [];
  const strategy = STRATEGIES.has(envStrategy) ? envStrategy : STRATEGIES.has(fileData.strategy) ? fileData.strategy : DEFAULT_STRATEGY;

  return { enabled, url, pool, strategy };
}

let proxyState = loadProxyState();

export function saveProxyState(state) {
  proxyState = { ...proxyState, ...state };
  const filePath = getProxyStateFile();
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(proxyState, null, 2));
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    log("warn", "Failed saving proxy state", { error: err.message });
  }
  return getProxyDetails();
}

export function getProxyDetails() {
  return {
    enabled: proxyState.enabled,
    url: redactProxyUrl(proxyState.url),
    rawUrl: proxyState.url,
    pool: proxyState.pool.map((p) => ({
      display: redactProxyUrl(p),
      healthy: isProxyHealthy(p),
    })),
    strategy: proxyState.strategy,
  };
}

export function setProxyConfig({ enabled, url, pool, strategy }) {
  if (url !== undefined) {
    if (url) validateProxyUrl(url);
    proxyState.url = url ? url.trim() : "";
  }
  if (enabled !== undefined) {
    proxyState.enabled = Boolean(enabled);
  }
  if (Array.isArray(pool)) {
    for (const p of pool) validateProxyUrl(p);
    proxyState.pool = pool.map((p) => p.trim());
  }
  if (strategy !== undefined) {
    if (!STRATEGIES.has(strategy)) throw new Error(`Unknown strategy: ${strategy}`);
    proxyState.strategy = strategy;
  }
  return saveProxyState(proxyState);
}

export function selectActiveProxy() {
  if (!proxyState.enabled) return null;
  const candidates = [];
  if (proxyState.url) candidates.push(proxyState.url);
  for (const p of proxyState.pool) {
    if (!candidates.includes(p)) candidates.push(p);
  }
  if (candidates.length === 0) return null;

  const healthy = candidates.filter(isProxyHealthy);
  const pool = healthy.length > 0 ? healthy : candidates;

  if (proxyState.strategy === "random") {
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  } else if (proxyState.strategy === "failover") {
    return pool[0];
  } else {
    // round-robin
    const selected = pool[poolIndex % pool.length];
    poolIndex = (poolIndex + 1) % pool.length;
    return selected;
  }
}

/**
 * Zero-dependency HTTP CONNECT forward proxy tunneling.
 * Sends HTTPS/HTTP requests through a forward proxy without external modules.
 */
export async function forwardProxyFetch(targetUrl, init = {}, proxyUrl = null) {
  const activeProxy = proxyUrl || selectActiveProxy();
  if (!activeProxy) {
    return fetch(targetUrl, init);
  }

  const parsedTarget = new URL(targetUrl);
  const parsedProxy = new URL(activeProxy);
  const isTargetHttps = parsedTarget.protocol === "https:";
  const targetPort = parsedTarget.port ? Number(parsedTarget.port) : isTargetHttps ? 443 : 80;

  const method = (init.method || "GET").toUpperCase();
  const headers = {};

  if (init.headers) {
    if (init.headers instanceof Headers) {
      for (const [k, v] of init.headers.entries()) headers[k] = v;
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  headers["host"] = parsedTarget.host;

  // Proxy auth header if specified in proxy URL
  let proxyAuth = "";
  if (parsedProxy.username || parsedProxy.password) {
    const creds = `${decodeURIComponent(parsedProxy.username)}:${decodeURIComponent(parsedProxy.password)}`;
    proxyAuth = `Basic ${Buffer.from(creds).toString("base64")}`;
  }

  return new Promise((resolve, reject) => {
    let aborted = false;
    let req = null;
    let proxyConnectReq = null;

    const onAbort = () => {
      aborted = true;
      if (proxyConnectReq) proxyConnectReq.destroy();
      if (req) req.destroy();
      reject(new DOMException("The operation was aborted", "AbortError"));
    };

    if (init.signal) {
      if (init.signal.aborted) return onAbort();
      init.signal.addEventListener("abort", onAbort, { once: true });
    }

    if (isTargetHttps) {
      // CONNECT tunneling for HTTPS targets
      const connectHeaders = {
        Host: `${parsedTarget.hostname}:${targetPort}`,
      };
      if (proxyAuth) {
        connectHeaders["Proxy-Authorization"] = proxyAuth;
      }

      const proxyPort = parsedProxy.port ? Number(parsedProxy.port) : parsedProxy.protocol === "https:" ? 443 : 80;
      const proxyModule = parsedProxy.protocol === "https:" ? https : http;

      proxyConnectReq = proxyModule.request({
        host: parsedProxy.hostname,
        port: proxyPort,
        method: "CONNECT",
        path: `${parsedTarget.hostname}:${targetPort}`,
        headers: connectHeaders,
      });

      proxyConnectReq.on("connect", (res, socket) => {
        if (aborted) {
          socket.destroy();
          return;
        }
        if (res.statusCode !== 200) {
          socket.destroy();
          markProxyFailure(activeProxy);
          return reject(new Error(`Proxy CONNECT to ${parsedProxy.host} failed with HTTP ${res.statusCode}`));
        }

        const tlsSocket = tls.connect({
          socket,
          servername: parsedTarget.hostname,
          rejectUnauthorized: true,
        });

        tlsSocket.on("error", (err) => {
          markProxyFailure(activeProxy);
          reject(err);
        });

        req = https.request({
          host: parsedTarget.hostname,
          port: targetPort,
          path: `${parsedTarget.pathname}${parsedTarget.search}`,
          method,
          headers,
          createConnection: () => tlsSocket,
        });

        attachResponseHandlers(req, resolve, reject, activeProxy);
        sendRequestBody(req, init.body);
      });

      proxyConnectReq.on("error", (err) => {
        markProxyFailure(activeProxy);
        reject(err);
      });

      proxyConnectReq.end();
    } else {
      // Direct HTTP proxying
      if (proxyAuth) headers["Proxy-Authorization"] = proxyAuth;
      const proxyPort = parsedProxy.port ? Number(parsedProxy.port) : 80;

      req = http.request({
        host: parsedProxy.hostname,
        port: proxyPort,
        method,
        path: targetUrl,
        headers,
      });

      attachResponseHandlers(req, resolve, reject, activeProxy);
      sendRequestBody(req, init.body);
    }
  });
}

function sendRequestBody(req, body) {
  if (!body) {
    req.end();
    return;
  }
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    req.end(body);
  } else if (body instanceof Uint8Array) {
    req.end(Buffer.from(body));
  } else if (typeof body.pipe === "function") {
    body.pipe(req);
  } else {
    req.end(String(body));
  }
}

function attachResponseHandlers(req, resolve, reject, activeProxy) {
  req.on("error", (err) => {
    markProxyFailure(activeProxy);
    reject(err);
  });

  req.on("response", (res) => {
    markProxySuccess(activeProxy);
    const webStream = Readable.toWeb(res);
    const response = new Response(webStream, {
      status: res.statusCode || 200,
      statusText: res.statusMessage || "OK",
      headers: res.headers,
    });
    resolve(response);
  });
}

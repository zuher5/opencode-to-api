import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { Readable } from "node:stream";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { markRelaySuccess, markRelayFailure, isRelayHealthy } from "./cooldown.js";
import { selectActiveProxy, forwardProxyFetch } from "./forward-proxy.js";

function getRelayStateFile() {
  return path.join(config.dataDir, "relay-state.json");
}

export function loadRelayState() {
  const filePath = getRelayStateFile();
  try {
    if (!fs.existsSync(filePath)) {
      return { enabled: false, url: "", relays: [] };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      enabled: Boolean(raw?.enabled),
      url: typeof raw?.url === "string" ? raw.url.trim() : "",
      relays: Array.isArray(raw?.relays) ? raw.relays : [],
    };
  } catch {
    return { enabled: false, url: "", relays: [] };
  }
}

export function saveRelayState(state) {
  const filePath = getRelayStateFile();
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, filePath);
    return { ok: true };
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    log("warn", "Failed saving relay state", { error: err.message });
    return { ok: false, error: err.message };
  }
}

let relayState = loadRelayState();
let relayHits = 0;

/** Which egress produced a relayFetch Response: "direct" or relay URL. */
export const responseVia = new WeakMap();

export function getRelayStats() {
  return {
    ...relayState,
    hits: relayHits,
  };
}

export function getRelayDetails() {
  return {
    enabled: relayState.enabled,
    url: relayState.url,
    hits: relayHits,
    relays: relayState.relays.map((r) => {
      const healthy = isRelayHealthy(r.url);
      return {
        ...r,
        healthy,
      };
    }),
  };
}

export function addRelay(rawUrl, label = "", auth = "") {
  const cleanUrl = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    throw new Error("Invalid relay URL. Must start with http:// or https://");
  }
  const cleanAuth = typeof auth === "string" ? auth.trim() : "";
  const existing = relayState.relays.find((r) => r.url === cleanUrl);
  if (!existing) {
    relayState.relays.push({
      url: cleanUrl,
      label: (label || "").trim() || "Manual Relay",
      ...(cleanAuth ? { auth: cleanAuth } : {}),
      addedAt: new Date().toISOString(),
    });
  } else {
    if (label) existing.label = label.trim();
    if (cleanAuth) existing.auth = cleanAuth;
  }
  if (!relayState.url) {
    relayState.url = cleanUrl;
  }
  saveRelayState(relayState);
  return getRelayDetails();
}

export function removeRelay(rawUrl) {
  const cleanUrl = (rawUrl || "").trim().replace(/\/+$/, "");
  relayState.relays = relayState.relays.filter((r) => r.url !== cleanUrl);
  if (relayState.url === cleanUrl) {
    relayState.url = relayState.relays.length ? relayState.relays[0].url : "";
  }
  saveRelayState(relayState);
  return getRelayDetails();
}

export function setActiveRelay(rawUrl) {
  const cleanUrl = (rawUrl || "").trim().replace(/\/+$/, "");
  if (cleanUrl) {
    const existing = relayState.relays.find((r) => r.url === cleanUrl);
    if (!existing) {
      relayState.relays.push({
        url: cleanUrl,
        label: "Manual Relay",
        addedAt: new Date().toISOString(),
      });
    }
    relayState.url = cleanUrl;
  } else {
    relayState.url = "";
  }
  saveRelayState(relayState);
  return getRelayDetails();
}

export function setRelayEnabled(enabled) {
  relayState.enabled = Boolean(enabled);
  saveRelayState(relayState);
  return getRelayDetails();
}

export function updateRelayConfig(newState) {
  relayState = { ...relayState, ...newState };
  saveRelayState(relayState);
  return relayState;
}

// TLS ClientHello JA4 cipher-list gate (9router opencodeTlsClient.js, live-
// verified 2026-11-07): OpenCode's edge keys on the TLS ClientHello JA4 cipher
// hash (BoringSSL/Bun order: 5b57614c22b0). Node's default OpenSSL cipher list
// is refused with 429 FreeUsageLimitError on every request even from a clean
// IP with valid v3 headers/body. Passing this cipher list + agent: false to
// Node's built-in https.request matches the BoringSSL JA4 cipher hash and
// opens a fresh TLS connection each time with zero external dependencies.
export const OPENCODE_CIPHER_LIST = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-ECDSA-AES128-SHA",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-ECDSA-AES256-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

function opencodeDirectFetch(url, opts = {}) {
  const proxy = selectActiveProxy();
  if (proxy) {
    return forwardProxyFetch(url, opts, proxy);
  }
  const isOpencode = typeof url === "string" && url.startsWith(config.upstreamOpenCode);
  if (!isOpencode || !url.startsWith("https:")) {
    return fetch(url, opts);
  }

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (opts.headers) {
      new Headers(opts.headers).forEach((v, k) => {
        headers[k] = v;
      });
    }

    const bodyBuf =
      opts.body == null
        ? undefined
        : Buffer.isBuffer(opts.body)
          ? opts.body
          : typeof opts.body === "string"
            ? Buffer.from(opts.body)
            : Buffer.from(opts.body);

    if (bodyBuf && !headers["content-length"]) {
      headers["content-length"] = String(bodyBuf.length);
    }

    const req = https.request(
      {
        method: opts.method || "GET",
        hostname: u.hostname,
        port: Number(u.port) || 443,
        path: `${u.pathname}${u.search}`,
        headers,
        agent: false,
        ciphers: OPENCODE_CIPHER_LIST,
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const resHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") resHeaders.set(k, v);
          else if (Array.isArray(v)) resHeaders.set(k, v.join(", "));
        }
        const nullBody = status === 204 || status === 205 || status === 304;
        resolve(
          new Response(
            nullBody
              ? null
              : (Readable.toWeb(res)),
            {
              status,
              statusText: res.statusMessage ?? "",
              headers: resHeaders,
            }
          )
        );
      }
    );

    if (opts.signal) {
      if (opts.signal.aborted) {
        req.destroy(opts.signal.reason ?? new Error("Aborted"));
        return;
      }
      opts.signal.addEventListener(
        "abort",
        () => req.destroy(opts.signal?.reason ?? new Error("Aborted")),
        { once: true }
      );
    }

    req.on("error", reject);
    if (bodyBuf) req.end(bodyBuf);
    else req.end();
  });
}

export function orderedRelayCandidates() {
  const urls = relayState.relays.map((r) => r.url).filter(Boolean);
  const ordered = urls.filter(isRelayHealthy);
  if (relayState.url) {
    const idx = ordered.indexOf(relayState.url);
    if (idx > 0) {
      ordered.splice(idx, 1);
      ordered.unshift(relayState.url);
    }
  }
  return [...ordered, ...urls.filter((u) => !isRelayHealthy(u))];
}

export async function relayFetch(url, opts = {}) {
  if (!relayState.enabled) {
    const res = await opencodeDirectFetch(url, opts);
    responseVia.set(res, "direct");
    return res;
  }

  const candidates = orderedRelayCandidates();
  if (candidates.length === 0) {
    const res = await opencodeDirectFetch(url, opts);
    responseVia.set(res, "direct");
    return res;
  }

  const parsedTarget = new URL(url);
  let lastError = null;

  for (const relay of candidates) {
    try {
      relayHits++;
      const headers = new Headers(opts.headers);
      headers.set("x-relay-target", `${parsedTarget.protocol}//${parsedTarget.host}`);
      headers.set("x-relay-path", `${parsedTarget.pathname}${parsedTarget.search}`);

      const relayAuth = relayState.relays.find((r) => r.url === relay)?.auth;
      if (relayAuth) {
        headers.set("x-relay-auth", relayAuth);
      }

      const res = await fetch(relay, { ...opts, headers });
      responseVia.set(res, relay);

      // 401 from a hardened worker = auth mismatch; distinct from upstream's own 401.
      // 4xx-except-429/408/403 is our payload's fault (400/404…) — rolling to another
      // relay would replay the same failure.
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408 && res.status !== 403)) {
        markRelaySuccess(relay);
        return res;
      }

      // 429/408/403/5xx: this egress IP is limited/flagged or relay is unhealthy.
      markRelayFailure(relay, res.status);
      await res.arrayBuffer().catch(() => {});
      lastError = new Error(`relay ${relay} responded with HTTP ${res.status}`);
    } catch (err) {
      markRelayFailure(relay);
      lastError = err;
    }
  }

  log("warn", "All relays exhausted, falling back to direct", { error: String(lastError) });
  const directRes = await opencodeDirectFetch(url, opts);
  responseVia.set(directRes, "direct");
  return directRes;
}

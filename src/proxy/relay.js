import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { markRelaySuccess, markRelayFailure, isRelayHealthy } from "./cooldown.js";

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

export function addRelay(rawUrl, label = "") {
  const cleanUrl = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    throw new Error("Invalid relay URL. Must start with http:// or https://");
  }
  const existing = relayState.relays.find((r) => r.url === cleanUrl);
  if (!existing) {
    relayState.relays.push({
      url: cleanUrl,
      label: (label || "").trim() || "Manual Relay",
      addedAt: new Date().toISOString(),
    });
  } else if (label) {
    existing.label = label.trim();
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
    return fetch(url, opts);
  }

  const candidates = orderedRelayCandidates();
  if (candidates.length === 0) {
    return fetch(url, opts);
  }

  const parsedTarget = new URL(url);
  let lastError = null;

  for (const relay of candidates) {
    try {
      relayHits++;
      const headers = new Headers(opts.headers);
      headers.set("x-relay-target", `${parsedTarget.protocol}//${parsedTarget.host}`);
      headers.set("x-relay-path", `${parsedTarget.pathname}${parsedTarget.search}`);

      const res = await fetch(relay, { ...opts, headers });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408)) {
        markRelaySuccess(relay);
        return res;
      }

      markRelayFailure(relay, res.status);
      await res.arrayBuffer().catch(() => {});
      lastError = new Error(`relay ${relay} responded with HTTP ${res.status}`);
    } catch (err) {
      markRelayFailure(relay);
      lastError = err;
    }
  }

  log("warn", "All relays exhausted, falling back to direct", { error: String(lastError) });
  return fetch(url, opts);
}

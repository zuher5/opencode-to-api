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

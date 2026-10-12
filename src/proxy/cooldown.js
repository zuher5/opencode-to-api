import { log } from "../utils/logger.js";

const relayHealth = new Map();

export function markRelaySuccess(url) {
  relayHealth.delete(url);
}

export function markRelayFailure(url, status) {
  const prev = relayHealth.get(url) ?? { consecutiveFailures: 0, cooldownUntil: 0 };
  const consecutive = prev.consecutiveFailures + 1;
  const base = status === 429 ? 90_000 : 30_000;
  const cooldownMs = Math.min(base * 2 ** (consecutive - 1), 15 * 60_000);
  relayHealth.set(url, {
    consecutiveFailures: consecutive,
    cooldownUntil: Date.now() + cooldownMs,
  });
  log("warn", "Relay cooling down", { url, status: status ?? 0, cooldownMs });
}

export function isRelayHealthy(url) {
  const h = relayHealth.get(url);
  return !h || h.cooldownUntil <= Date.now();
}

export function getRelayHealthMap() {
  return new Map(relayHealth);
}

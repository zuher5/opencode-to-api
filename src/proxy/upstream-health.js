/**
 * Upstream 429/403 triage + reactive cooldowns.
 * Ported from pi-bansos v0.7.1 (extensions/upstream-health.ts).
 *
 * Free-tier upstreams answer two unrelated problems with two different
 * errors, and conflating them is the classic misdiagnosis:
 *
 * - `429 FreeUsageLimitError` / "Rate limit exceeded" — QUOTA. The request
 *   ran; the budget (per model, per IP, dynamic with upstream capacity) is
 *   spent. Backing off per model is correct; retrying immediately just digs
 *   the IP deeper into risk control.
 * - `403 FreeTierError` "…abusive traffic from this IP address" — EGRESS IP
 *   flagged. Backoff cannot fix this; the network needs a different egress
 *   (relay). Cooldown fails fast with that instruction instead of hammering.
 * - `403 FreeTierError` "…can only be used from within OpenCode" — SHAPE
 *   GATE. Deterministic fingerprint rejection: every retry fails identically
 *   on every egress, so no cooldown is recorded and the body is surfaced
 *   as-is (if this fires, the upstream gate changed — not a rate problem).
 *
 * Separate from the local request guard (flood protection with our own
 * numbers, src/proxy/rate-limit.js) and from relay pool cooldowns (egress
 * health, src/proxy/cooldown.js): this mirrors what the upstream itself
 * reported, keyed by what it meters.
 */

/** @typedef {"quota" | "ip-flagged" | "shape-gate" | "other"} UpstreamErrorKind */

/**
 * Classify an upstream error response from its status + body text.
 * @param {number} status
 * @param {string} body
 * @returns {UpstreamErrorKind}
 */
export function classifyUpstreamError(status, body) {
  const text = body ?? "";
  if (status === 403 && /abusive traffic/i.test(text)) return "ip-flagged";
  if (status === 403 && /FreeTierError/i.test(text)) return "shape-gate";
  if (status === 429) return "quota";
  if (/FreeUsageLimitError|Free usage limit|rate_limit_error|Rate limit exceeded/i.test(text)) {
    return "quota";
  }
  return "other";
}

/**
 * Parse a `Retry-After` header (delay-seconds or HTTP-date form).
 * Returns null when absent/unparseable. Values are clamped to [0, 3600]s so
 * a hostile/garbage header cannot wedge a model for hours.
 * @param {string | null | undefined} value
 * @param {number} [now]
 * @returns {number | null}
 */
export function retryAfterSeconds(value, now = Date.now()) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.floor(n), 3600);
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, Math.ceil((date - now) / 1000)), 3600);
  }
  return null;
}

const QUOTA_BASE_MS = 90_000;
const QUOTA_CAP_MS = 15 * 60_000;
const EGRESS_BASE_MS = 5 * 60_000;
const EGRESS_CAP_MS = 30 * 60_000;
/** Ceiling for a server-provided Retry-After (keeps long hints sane). */
const SERVER_HINT_CAP_MS = 60 * 60_000;

/**
 * @typedef {{ kind: "quota" | "ip-flagged", until: number }} Cooldown
 */

/**
 * Tracks reactive cooldowns per `upstream:model` (quota) and per upstream
 * egress (IP-flag). `now` is injectable for tests.
 */
export class UpstreamHealth {
  constructor() {
    /** @type {Map<string, {failures: number, until: number}>} */
    this.models = new Map();
    /** @type {Map<string, {failures: number, until: number}>} */
    this.egress = new Map();
  }

  /**
   * Record a quota 429 for one model; returns the cooldown ms applied.
   * @returns {number}
   */
  recordQuotaFailure(upstream, model, retryAfterSec, now = Date.now()) {
    return this.#bump(
      this.models,
      `${upstream}:${model}`,
      QUOTA_BASE_MS,
      QUOTA_CAP_MS,
      retryAfterSec == null ? null : retryAfterSec * 1000,
      now,
    );
  }

  /** Record an IP-flag 403 for the whole upstream egress; returns cooldown ms. */
  recordEgressFailure(upstream, now = Date.now()) {
    return this.#bump(this.egress, upstream, EGRESS_BASE_MS, EGRESS_CAP_MS, null, now);
  }

  /**
   * Active cooldown for a model, or null. Egress flags win over quota.
   * @returns {Cooldown | null}
   */
  cooldown(upstream, model, now = Date.now()) {
    const e = this.egress.get(upstream);
    if (e && e.until > now) return { kind: "ip-flagged", until: e.until };
    const m = this.models.get(`${upstream}:${model}`);
    if (m && m.until > now) return { kind: "quota", until: m.until };
    return null;
  }

  /** A 2xx clears both the model's quota state and the egress flag. */
  recordSuccess(upstream, model) {
    this.models.delete(`${upstream}:${model}`);
    this.egress.delete(upstream);
  }

  /** Snapshot for /health and the web GUI. */
  snapshot(now = Date.now()) {
    const models = [];
    for (const [key, entry] of this.models.entries()) {
      const [upstream, ...rest] = key.split(":");
      models.push({
        upstream,
        model: rest.join(":"),
        kind: "quota",
        failures: entry.failures,
        until: entry.until,
        active: entry.until > now,
      });
    }
    const egress = [];
    for (const [upstream, entry] of this.egress.entries()) {
      egress.push({
        upstream,
        kind: "ip-flagged",
        failures: entry.failures,
        until: entry.until,
        active: entry.until > now,
      });
    }
    return { models, egress };
  }

  /** Drop every expired entry so the maps cannot grow without bound. */
  prune(now = Date.now()) {
    for (const [k, v] of this.models.entries()) {
      if (v.until <= now) this.models.delete(k);
    }
    for (const [k, v] of this.egress.entries()) {
      if (v.until <= now) this.egress.delete(k);
    }
  }

  reset() {
    this.models.clear();
    this.egress.clear();
  }

  #bump(map, key, baseMs, capMs, serverHintMs, now) {
    const prev = map.get(key);
    const failures = (prev?.failures ?? 0) + 1;
    let ms = Math.min(baseMs * 2 ** (failures - 1), capMs);
    if (serverHintMs != null) {
      // A server-provided Retry-After outranks our escalation, but is
      // itself capped so a bad hint cannot wedge a model for a day.
      ms = Math.min(Math.max(ms, serverHintMs), SERVER_HINT_CAP_MS);
    }
    map.set(key, { failures, until: now + ms });
    return ms;
  }
}

/** Process-wide health tracker. */
export const upstreamHealth = new UpstreamHealth();

/**
 * Classify + record an upstream failure in one step. Returns the kind and the
 * cooldown applied (0 when nothing was recorded).
 *
 * Quota cooldowns are only recorded from direct-egress answers when
 * `relayActive` is false: a 429 that survived relay rolling arrived via the
 * direct fallback, and a healthy relay may hold its own per-IP budget. The
 * egress IP-flag fail-fast is likewise skipped while a relay is active (the
 * relay is a different egress and runs its own failover).
 *
 * @returns {{ kind: UpstreamErrorKind, cooldownMs: number }}
 */
export function recordUpstreamFailure({
  upstream,
  model,
  status,
  body,
  retryAfter,
  relayActive = false,
  health = upstreamHealth,
  now = Date.now(),
}) {
  const kind = classifyUpstreamError(status, body);
  if (kind === "quota") {
    if (relayActive) return { kind, cooldownMs: 0 };
    const sec = retryAfterSeconds(retryAfter, now);
    return { kind, cooldownMs: health.recordQuotaFailure(upstream, model, sec, now) };
  }
  if (kind === "ip-flagged") {
    if (relayActive) return { kind, cooldownMs: 0 };
    return { kind, cooldownMs: health.recordEgressFailure(upstream, now) };
  }
  return { kind, cooldownMs: 0 };
}

/** Human-readable cooldown reason for the client + logs. */
export function describeCooldown(cd, now = Date.now()) {
  const secs = Math.max(1, Math.ceil((cd.until - now) / 1000));
  if (cd.kind === "ip-flagged") {
    return `Upstream flagged this egress IP (abusive traffic). Add or switch to a relay egress, then retry in ${secs}s.`;
  }
  return `Upstream free-usage quota for this model is exhausted. Retry in ${secs}s.`;
}

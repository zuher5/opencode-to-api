import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { ALL_KNOWN_MODELS } from "./definitions.js";
import { loadCatalogCache, saveCatalogCache } from "./cache.js";
import { opencodeHeaders } from "../adapters/opencode-zen.js";
import { kiloHeaders } from "../adapters/kilo.js";

let aliveCatalog = [];

function extractCatalogIds(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.data)) return null;
  const items = data.data;
  if (!items.every((m) => m && typeof m === "object" && typeof m.id === "string")) return null;
  return new Set(items.map((m) => m.id));
}

export async function fetchOpenCodeCatalog() {
  try {
    const res = await fetch(`${config.upstreamOpenCodeCatalog}/models`, {
      headers: opencodeHeaders(true),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return extractCatalogIds(json);
  } catch (err) {
    log("debug", "Failed fetching OpenCode catalog", { error: err.message });
    return null;
  }
}

export async function fetchKiloCatalog() {
  try {
    const res = await fetch(config.kiloModelsUrl, {
      headers: kiloHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return extractCatalogIds(json);
  } catch (err) {
    log("debug", "Failed fetching Kilo catalog", { error: err.message });
    return null;
  }
}

/**
 * The curated list is authoritative: every id here was chat-verified against
 * the upstream at sweep time (pi-bansos v0.7.1). The live catalog at
 * `/zen/v1/models` is *not* a reliable availability signal — it lags the
 * inference surface in both directions (see the sweep notes in
 * definitions.js), and Kilo drifts on the `:free` suffix. Filtering the
 * curated list against it silently hid models that still answer (and kept
 * ones that were never chat-verified), and it made behaviour inconsistent:
 * with no cache the fallback served the full list, so an online start exposed
 * fewer models than an offline one.
 *
 * The cache is therefore kept for freshness metadata only, not as a gate.
 */
export function modelsFromCache(cache) {
  // `cache` is accepted for call-site compatibility (and future enrichment);
  // availability is decided by the curated definitions alone.
  void cache;
  return ALL_KNOWN_MODELS;
}

export async function refreshCatalogCache() {
  const [opencode, kilo] = await Promise.all([
    fetchOpenCodeCatalog(),
    fetchKiloCatalog(),
  ]);

  const prior = loadCatalogCache();
  const next = {
    fetchedAt: opencode || kilo ? Date.now() : prior.fetchedAt,
    ...(opencode ? { opencode: [...opencode] } : prior.opencode ? { opencode: prior.opencode } : {}),
    ...(kilo ? { kilo: [...kilo] } : prior.kilo ? { kilo: prior.kilo } : {}),
  };

  if (opencode || kilo) {
    saveCatalogCache(next);
  }

  const updatedModels = modelsFromCache(next);
  if (updatedModels.length > 0) {
    aliveCatalog = updatedModels;
  }
  return next;
}

export async function initCatalog() {
  const cached = loadCatalogCache();
  const hasCachedData = (cached.opencode?.length ?? 0) + (cached.kilo?.length ?? 0) > 0;

  if (hasCachedData) {
    aliveCatalog = modelsFromCache(cached);
    // Background refresh
    refreshCatalogCache().catch(() => {});
  } else {
    // Attempt instant discovery
    try {
      await refreshCatalogCache();
    } catch {
      aliveCatalog = ALL_KNOWN_MODELS;
    }
  }

  if (aliveCatalog.length === 0) {
    aliveCatalog = ALL_KNOWN_MODELS;
  }

  log("info", `Catalog loaded with ${aliveCatalog.length} active models`);
  return aliveCatalog;
}

export function getAliveCatalog() {
  if (!aliveCatalog || aliveCatalog.length === 0) {
    aliveCatalog = ALL_KNOWN_MODELS;
  }
  return aliveCatalog;
}

export function findModel(modelId) {
  const catalog = getAliveCatalog();
  return catalog.find((m) => m.id === modelId) || null;
}

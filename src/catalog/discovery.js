import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { ALL_KNOWN_MODELS } from "./definitions.js";
import { loadCatalogCache, saveCatalogCache } from "./cache.js";
import { opencodeHeaders } from "../adapters/opencode-zen.js";
import { kiloHeaders } from "../adapters/kilo.js";

let aliveCatalog = [];
let cachedFamilies = {};

export function isTrustedCatalogBaseUrl(url) {
  return typeof url === "string" && /^https:\/\/([a-z0-9-]+\.)*opencode\.ai(\/|$)/i.test(url);
}

export function parseCatalogData(json) {
  const out = {};
  const oc = json?.opencode;
  if (!oc || typeof oc !== "object") return out;
  const api = typeof oc.api === "string" ? oc.api.replace(/\/+$/, "") : null;
  if (api && isTrustedCatalogBaseUrl(api)) {
    out.catalogBase = api;
    out.chatUrl = `${api}/chat/completions`;
    if (api.endsWith("/v1")) out.responsesUrl = `${api}/responses`;
  }

  const freeModels = [];
  const modelFacts = {};
  const families = {};

  for (const [id, m] of Object.entries(oc.models || {})) {
    const zeroCost = Number(m?.cost?.input) === 0 && Number(m?.cost?.output) === 0;
    const deprecated = m?.status === "deprecated";
    const usable = m?.tool_call !== false;
    const key = id.toLowerCase();

    if (zeroCost && !deprecated && usable) {
      freeModels.push(id);
    }

    if (typeof m?.reasoning === "boolean") {
      modelFacts[key] = {
        reasoning: m.reasoning,
        maxOutput: Number(m?.limit?.output) > 0 ? Number(m.limit.output) : null,
        contextWindow: Number(m?.limit?.context) > 0 ? Number(m.limit.context) : null,
      };
    }

    const family = typeof m?.family === "string" ? m.family.trim().toLowerCase() : "";
    if (family && zeroCost && !deprecated && usable && !families[family]) {
      families[family] = id;
    }
  }

  if (freeModels.length > 0) out.freeModels = freeModels;
  if (Object.keys(modelFacts).length > 0) out.modelFacts = modelFacts;
  if (Object.keys(families).length > 0) out.modelFamilies = families;

  return out;
}

export async function fetchOpenCodeCatalogApi() {
  try {
    const res = await fetch(config.opencodeCatalogApi, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return parseCatalogData(json);
  } catch (err) {
    log("debug", "Failed fetching OpenCode catalog API", { error: err.message });
    return null;
  }
}

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
  const [opencode, kilo, catalogApi] = await Promise.all([
    fetchOpenCodeCatalog(),
    fetchKiloCatalog(),
    fetchOpenCodeCatalogApi(),
  ]);

  const prior = loadCatalogCache();
  const next = {
    fetchedAt: opencode || kilo || catalogApi ? Date.now() : prior.fetchedAt,
    ...(opencode ? { opencode: [...opencode] } : prior.opencode ? { opencode: prior.opencode } : {}),
    ...(kilo ? { kilo: [...kilo] } : prior.kilo ? { kilo: prior.kilo } : {}),
    ...(catalogApi ? { catalogApi } : prior.catalogApi ? { catalogApi: prior.catalogApi } : {}),
  };

  if (opencode || kilo || catalogApi) {
    saveCatalogCache(next);
  }

  if (next.catalogApi?.modelFamilies) {
    cachedFamilies = { ...cachedFamilies, ...next.catalogApi.modelFamilies };
  }

  const updatedModels = modelsFromCache(next);
  if (updatedModels.length > 0) {
    aliveCatalog = updatedModels;
  }
  return next;
}

export async function initCatalog() {
  const cached = loadCatalogCache();
  if (cached.catalogApi?.modelFamilies) {
    cachedFamilies = { ...cachedFamilies, ...cached.catalogApi.modelFamilies };
  }
  const hasCachedData = (cached.opencode?.length ?? 0) + (cached.kilo?.length ?? 0) > 0 || Boolean(cached.catalogApi);

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
  if (!modelId || typeof modelId !== "string") return null;
  const catalog = getAliveCatalog();
  const direct = catalog.find((m) => m.id === modelId);
  if (direct) return direct;

  const lower = modelId.toLowerCase();
  const targetId = cachedFamilies[lower];
  if (targetId) {
    return catalog.find((m) => m.id === targetId) || null;
  }
  return null;
}

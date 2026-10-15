import { config } from "../config.js";
import { log } from "../utils/logger.js";
import {
  OPENCODE_MODELS,
  KILO_MODELS,
  ALL_KNOWN_MODELS,
} from "./definitions.js";
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

export function modelsFromCache(cache) {
  const hasCachedEntries = (cache.opencode?.length ?? 0) + (cache.kilo?.length ?? 0) > 0;
  if (!hasCachedEntries) {
    return ALL_KNOWN_MODELS;
  }

  const opencode = new Set(cache.opencode ?? []);
  const kilo = new Set(cache.kilo ?? []);
  const pinnedKilo = new Set(["openrouter/free"]);

  const activeOpencode = OPENCODE_MODELS.filter((m) => opencode.has(m.id));
  const activeKilo = KILO_MODELS.filter((m) => kilo.has(m.id) || pinnedKilo.has(m.id));

  return [...activeOpencode, ...activeKilo];
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

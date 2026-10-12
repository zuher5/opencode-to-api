import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { log } from "../utils/logger.js";

export function getCacheFilePath() {
  return path.join(config.dataDir, "models-cache.json");
}

export function loadCatalogCache() {
  const filePath = getCacheFilePath();
  try {
    if (!fs.existsSync(filePath)) return { fetchedAt: 0 };
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { fetchedAt: 0 };

    const validArray = (arr) => Array.isArray(arr) && arr.every((item) => typeof item === "string");
    return {
      fetchedAt: typeof raw.fetchedAt === "number" ? raw.fetchedAt : 0,
      ...(validArray(raw.opencode) ? { opencode: raw.opencode } : {}),
      ...(validArray(raw.kilo) ? { kilo: raw.kilo } : {}),
    };
  } catch (err) {
    log("debug", "Could not read model cache file", { error: err.message });
    return { fetchedAt: 0 };
  }
}

export function saveCatalogCache(data) {
  const filePath = getCacheFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpFile = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    log("warn", "Model catalog cache save failed", { error: err.message });
  }
}

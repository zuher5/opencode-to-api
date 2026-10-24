import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../utils/logger.js";

let activeLocalApiKey = "";

export function initLocalAuth() {
  // A configured key (config.localApiKey, default "sk-2004") always wins.
  // The persisted-file and random-generation paths below are the fallback for
  // when that config is explicitly empty.
  if (config.localApiKey) {
    activeLocalApiKey = config.localApiKey;
    return activeLocalApiKey;
  }

  const keyFilePath = path.join(config.dataDir, "local-key.json");
  try {
    if (fs.existsSync(keyFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
      if (typeof parsed?.key === "string" && parsed.key.trim()) {
        activeLocalApiKey = parsed.key.trim();
        return activeLocalApiKey;
      }
    }
  } catch (err) {
    log("warn", "Failed reading existing local API key, generating new one", { error: err.message });
  }

  // Generate new 32-byte hex key
  activeLocalApiKey = `sk-local-${randomBytes(24).toString("hex")}`;
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(
      keyFilePath,
      JSON.stringify({
        key: activeLocalApiKey,
        createdAt: new Date().toISOString(),
      }, null, 2),
      { mode: 0o600 }
    );
  } catch (err) {
    log("warn", "Could not persist local API key to disk", { error: err.message });
  }

  return activeLocalApiKey;
}

export function getLocalApiKey() {
  if (!activeLocalApiKey) {
    return initLocalAuth();
  }
  return activeLocalApiKey;
}

export function validateLocalAuth(req) {
  const expectedKey = getLocalApiKey();
  if (!expectedKey) return { valid: true };

  // 1. Authorization: Bearer <token>
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === expectedKey) return { valid: true };
  }

  // 2. x-api-key
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.trim() === expectedKey) {
    return { valid: true };
  }

  // 3. Query string api_key
  try {
    const parsedUrl = new URL(req.url, "http://127.0.0.1");
    const queryKey = parsedUrl.searchParams.get("api_key");
    if (queryKey && queryKey.trim() === expectedKey) {
      return { valid: true };
    }
  } catch {}

  return {
    valid: false,
    message: "Invalid or missing API key. Provide Authorization: Bearer <local_key>",
  };
}

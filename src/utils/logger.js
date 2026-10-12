import { config } from "../config.js";

function sanitize(value) {
  if (typeof value === "string") {
    return value.replace(/(Bearer\s+|api[_-]?key[:=]\s*)[a-zA-Z0-9_\-\.]{6,}/gi, "$1***REDACTED***");
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (/key|secret|token|auth/i.test(k) && typeof v === "string") {
        clean[k] = v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : "***";
      } else {
        clean[k] = sanitize(v);
      }
    }
    return clean;
  }
  return value;
}

export function log(level, message, meta) {
  if (!config.debug && level === "debug") return;
  const ts = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(sanitize(meta))}` : "";
  const line = `[opencode-to-api] [${ts}] [${level.toUpperCase()}] ${message}${metaStr}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

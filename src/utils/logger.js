import { config } from "../config.js";

const SENSITIVE_TOKEN_REGEX = /(Bearer\s+|api[_-]?key[:=]\s*)[a-zA-Z0-9_.-]{6,}/gi;
const SENSITIVE_KEY_NAME_REGEX = /key|secret|token|auth/i;

function sanitize(value) {
  if (typeof value === "string") {
    return value.replace(SENSITIVE_TOKEN_REGEX, "$1***REDACTED***");
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_NAME_REGEX.test(k) && typeof v === "string") {
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

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { OPENCODE_RESPONSES_MODELS } from "../catalog/definitions.js";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const OPENCODE_UA_VERSION_RE = /^\d+\.\d+\.\d+$/;

export const OPENCODE_FINGERPRINT_TOOLS = [
  "bash",
  "glob",
  "grep",
  "read",
  "edit",
  "write",
];

const OPENCODE_PROJECT_ID = randomBytes(20).toString("hex");

let lastSessionTs = 0;
let sessionCounter = 0;

function unstableRandom() {
  const bytes = randomBytes(14);
  let out = "";
  for (let i = 0; i < 14; i++) {
    out += BASE62[bytes[i] % 62];
  }
  return out;
}

function timeHexFrom(value) {
  return Array.from({ length: 6 }, (_, i) =>
    Number((value >> BigInt(40 - 8 * i)) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

export function generateSessionId(timestamp = Date.now()) {
  if (timestamp !== lastSessionTs) {
    lastSessionTs = timestamp;
    sessionCounter = 0;
  }
  sessionCounter++;
  const current = BigInt(timestamp) * 0x1000n + BigInt(sessionCounter);
  return `ses_${timeHexFrom(~current)}${unstableRandom()}`;
}

export function generateRequestId(timestamp = Date.now()) {
  const current = BigInt(timestamp) * 0x1000n + 1n;
  return `msg_${timeHexFrom(current)}${unstableRandom()}`;
}

export const OPENCODE_SESSION = generateSessionId();

let liveOpenCodeVersion = null;

export function getOpenCodeUA() {
  const override = process.env[config.opencodeUaEnv]?.trim();
  if (override) {
    return override.startsWith("opencode/") ? override : `opencode/${override}`;
  }
  if (liveOpenCodeVersion && OPENCODE_UA_VERSION_RE.test(liveOpenCodeVersion)) {
    return `opencode/${liveOpenCodeVersion}`;
  }
  return `opencode/${config.opencodeUaFallback}`;
}

export async function refreshOpenCodeUA() {
  if (process.env[config.opencodeUaEnv]?.trim()) return;
  const versionFile = path.join(config.dataDir, "opencode-version.json");
  try {
    const res = await fetch("https://registry.npmjs.org/opencode-ai/latest", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = await res.json();
    const version = data?.version;
    if (typeof version === "string" && OPENCODE_UA_VERSION_RE.test(version)) {
      if (version !== liveOpenCodeVersion) {
        liveOpenCodeVersion = version;
        try {
          fs.mkdirSync(config.dataDir, { recursive: true });
          fs.writeFileSync(versionFile, JSON.stringify({ version, checkedAt: Date.now() }), {
            mode: 0o600,
          });
        } catch {}
        log("info", "OpenCode UA version updated", { version });
      }
    }
  } catch (err) {
    log("debug", "OpenCode UA refresh skipped", { error: err.message });
  }
}

export function opencodeHeaders(customAuth = null) {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return {
    "User-Agent": getOpenCodeUA(),
    Authorization: customAuth || "Bearer public",
    "x-opencode-client": "desktop",
    "x-opencode-project": OPENCODE_PROJECT_ID,
    "x-opencode-session": OPENCODE_SESSION,
    "x-session-affinity": OPENCODE_SESSION,
    "x-opencode-request": generateRequestId(),
    b3: `${traceId}-${spanId}-1-${spanId}`,
    traceparent: `00-${traceId}-${spanId}-01`,
    Accept: "text/event-stream",
  };
}

function toolNameOf(tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return "";
  const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function)
    ? tool.function
    : null;
  const raw = typeof tool.name === "string" ? tool.name : typeof fn?.name === "string" ? fn.name : "";
  return raw.trim();
}

export function ensureChatFingerprintTools(body) {
  const present = new Set();
  if (!Array.isArray(body.tools)) body.tools = [];
  for (const tool of body.tools) {
    const name = toolNameOf(tool);
    if (name) present.add(name);
  }
  let injected = false;
  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    if (present.has(name)) continue;
    body.tools.push({
      type: "function",
      function: {
        name,
        description: `OpenCode built-in ${name} tool`,
        parameters: { type: "object", properties: {} },
      },
    });
    injected = true;
  }
  if (injected && body.tool_choice === undefined) {
    body.tool_choice = "none";
  }
}

export function ensureResponsesFingerprintTools(body) {
  const present = new Set();
  if (!Array.isArray(body.tools)) body.tools = [];
  for (const tool of body.tools) {
    const name = toolNameOf(tool);
    if (name) present.add(name);
  }
  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    if (present.has(name)) continue;
    body.tools.push({
      type: "function",
      name,
      description: `OpenCode built-in ${name} tool`,
      parameters: { type: "object", properties: {} },
    });
  }
}

export function sanitizeResponsesItems(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    if (item.type === "reasoning") return false;
    delete item.encrypted_content;
    delete item.reasoning_encrypted_content;
    return true;
  });
}

/**
 * Transforms request body to satisfy OpenCode Zen free-tier gate.
 */
export function transformOpencodeBody(body) {
  body.stream = true;
  const model = typeof body.model === "string" ? body.model : "";
  const isResponses = OPENCODE_RESPONSES_MODELS.has(model) || model.includes("muse-spark");

  if (isResponses) {
    if (body.max_output_tokens === undefined) {
      if (typeof body.max_completion_tokens === "number") {
        body.max_output_tokens = body.max_completion_tokens;
      } else if (typeof body.max_tokens === "number") {
        body.max_output_tokens = body.max_tokens;
      }
    }
    delete body.max_tokens;
    delete body.max_completion_tokens;
    body.store = false;
    ensureResponsesFingerprintTools(body);
    sanitizeResponsesItems(body);
  } else {
    ensureChatFingerprintTools(body);
  }
  return body;
}

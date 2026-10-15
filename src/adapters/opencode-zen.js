import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { OPENCODE_RESPONSES_MODELS } from "../catalog/definitions.js";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const OPENCODE_UA_VERSION_RE = /^\d+\.\d+\.\d+$/;

// v2 gate (2026-10-14): exact read + shell tool schemas from packages/core/src/tool/plugin/{read,shell}.ts
export const OPENCODE_EXACT_TOOLS = [
  {
    type: "function",
    function: {
      name: "read",
      description:
        "Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File or directory to read" },
          offset: { type: "number", description: "The line or directory entry to start reading from (1-based)" },
          limit: { type: "number", description: "The maximum number of lines or directory entries to read (defaults to and capped at 2000)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell",
      description:
        "Execute a shell command and return its output. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command string to execute" },
          workdir: { type: "string", description: "Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead." },
          timeout: { type: "number", description: "Timeout in milliseconds. Set to 0 to disable the timeout." },
          background: { type: "boolean", description: "Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion." },
        },
        required: ["command"],
      },
    },
  },
];

// Real opencode tool names — caller tools with one of these names are aliased with _pi on the wire
export const OPENCODE_TOOL_NAMES = new Set([
  "read", "shell", "bash", "glob", "grep", "edit", "write", "patch",
  "webfetch", "websearch", "question", "skill", "subagent", "todowrite",
  "mcp-resource", "opencode",
]);

export const OPENCODE_FINGERPRINT_TOOLS = ["read", "shell"];

const OPENCODE_PROJECT_ID = randomBytes(20).toString("hex");

// Bit-exact Identifier mask (low 48 bits as 12-hex)
const OPENCODE_ID_MASK = (1n << 48n) - 1n;

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
  const v = value & OPENCODE_ID_MASK;
  return Array.from({ length: 6 }, (_, i) =>
    Number((v >> BigInt(40 - 8 * i)) & 0xffn)
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

export function opencodeHeaders(withRequestHeader = false, customAuth = null) {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const headers = {
    "User-Agent": getOpenCodeUA(),
    Authorization: customAuth || "Bearer public",
    "x-opencode-client": "desktop",
    "x-opencode-project": OPENCODE_PROJECT_ID,
    "x-opencode-session": OPENCODE_SESSION,
    "x-opencode-session-id": OPENCODE_SESSION,
    "x-session-affinity": OPENCODE_SESSION,
    b3: `${traceId}-${spanId}-1-${spanId}`,
    traceparent: `00-${traceId}-${spanId}-01`,
    Accept: "text/event-stream",
  };
  // v2 gate rejects x-opencode-request on inference endpoints. Only sent on catalog/v1 surfaces.
  if (withRequestHeader) {
    headers["x-opencode-request"] = generateRequestId();
  }
  return headers;
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
  if (!Array.isArray(body.tools)) body.tools = [];
  // 1) Alias caller tools whose names collide with real opencode tools
  const wireToCaller = new Map();
  body.tools = body.tools.map((tool) => {
    const name = toolNameOf(tool);
    if (!name || !OPENCODE_TOOL_NAMES.has(name.toLowerCase())) return tool;
    const alias = `${name}_pi`;
    wireToCaller.set(alias, name);
    if (tool && typeof tool === "object" && !Array.isArray(tool)) {
      const cloned = { ...tool };
      if (cloned.function && typeof cloned.function === "object") {
        cloned.function = { ...cloned.function, name: alias };
      } else if (typeof cloned.name === "string") {
        cloned.name = alias;
      }
      return cloned;
    }
    return tool;
  });
  if (wireToCaller.size) {
    body.__bansosToolAliases = Object.fromEntries(wireToCaller);
  }

  // 2) Append exact read + shell tool definitions
  const present = new Set();
  for (const tool of body.tools) {
    const name = toolNameOf(tool);
    if (name) present.add(name);
  }
  for (const t of OPENCODE_EXACT_TOOLS) {
    if (present.has(t.function.name)) continue;
    body.tools.push(structuredClone(t));
  }
}

export function ensureResponsesFingerprintTools(body) {
  const present = new Set();
  if (!Array.isArray(body.tools)) body.tools = [];
  for (const tool of body.tools) {
    const name = toolNameOf(tool);
    if (name) present.add(name);
  }
  for (const t of OPENCODE_EXACT_TOOLS) {
    const name = t.function.name;
    if (present.has(name)) continue;
    body.tools.push({
      type: "function",
      name,
      description: t.function.description,
      parameters: t.function.parameters,
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

export function restoreToolAliases(text, aliases) {
  if (!text || !aliases || Object.keys(aliases).length === 0) return text;
  return text.replace(/([A-Za-z0-9_-]+)_pi\b/g, (match, base) => aliases[`${base}_pi`] ?? match);
}

/**
 * Transforms request body to satisfy OpenCode Zen free-tier gate.
 * Returns { body, responsesPath: boolean }
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
    return { body, responsesPath: true };
  } else {
    ensureChatFingerprintTools(body);
    return { body, responsesPath: false };
  }
}

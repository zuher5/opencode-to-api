import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { log } from "./utils/logger.js";
import { sendJsonError } from "./utils/errors.js";
import { validateLocalAuth, getLocalApiKey } from "./auth/local-auth.js";
import { getAliveCatalog, findModel } from "./catalog/discovery.js";
import { KILO_MODEL_IDS } from "./catalog/definitions.js";
import { transformOpencodeBody, opencodeHeaders } from "./adapters/opencode-zen.js";
import { kiloHeaders } from "./adapters/kilo.js";
import { checkRateLimit } from "./proxy/rate-limit.js";
import {
  relayFetch,
  getRelayStats,
  getRelayDetails,
  addRelay,
  removeRelay,
  setActiveRelay,
  setRelayEnabled,
} from "./proxy/relay.js";
import { pipeUpstreamStream, aggregateStreamToResponse } from "./proxy/stream.js";

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS", "HEAD"]);
const PATH_TRAVERSAL_PATTERN = /\.\./;

let cachedHtml = null;
let cachedHtmlPath = null;

function getWebHtml() {
  if (cachedHtml && !config.debug) return cachedHtml;
  if (!cachedHtmlPath) {
    cachedHtmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "web", "index.html");
  }
  cachedHtml = fs.readFileSync(cachedHtmlPath, "utf8");
  return cachedHtml;
}

function getClientIP(req) {
  const addr = req.socket?.remoteAddress;
  if (!addr) return "127.0.0.1";
  return addr.startsWith("::ffff:") ? addr.slice(7) : addr;
}

async function readBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function handleRequest(req, res) {
  const method = req.method ?? "GET";
  if (!ALLOWED_METHODS.has(method)) {
    return sendJsonError(res, 405, "Method not allowed", "invalid_request_error");
  }

  // CORS Preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS, HEAD",
      "access-control-allow-headers": "Content-Type, Authorization, x-api-key",
      "access-control-max-age": "86400",
    });
    return res.end();
  }

  const rawUrl = req.url || "/";
  if (PATH_TRAVERSAL_PATTERN.test(rawUrl)) {
    return sendJsonError(res, 403, "Forbidden path", "invalid_request_error");
  }

  const parsedUrl = new URL(rawUrl, `http://127.0.0.1:${config.port}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

  // Public Health Checks
  if (pathname === "/health" || pathname === "/v1/health") {
    const alive = getAliveCatalog();
    const stats = getRelayStats();
    const body = JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      modelsCount: alive.length,
      relay: {
        enabled: stats.enabled,
        active: stats.url || "direct",
        hits: stats.hits,
      },
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-length": Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // Web GUI HTML Page
  if (method === "GET" && (pathname === "/" || pathname === "/gui")) {
    try {
      const html = getWebHtml();
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(html),
      });
      return res.end(html);
    } catch (err) {
      return sendJsonError(res, 500, "Web GUI HTML file missing", "api_error");
    }
  }

  // GET /api/info
  if (method === "GET" && pathname === "/api/info") {
    const alive = getAliveCatalog();
    const stats = getRelayStats();
    const body = JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      apiKey: getLocalApiKey(),
      modelsCount: alive.length,
      relay: stats,
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-length": Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // GET /api/relay
  if (method === "GET" && pathname === "/api/relay") {
    const details = getRelayDetails();
    const body = JSON.stringify(details);
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-length": Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // POST /api/relay
  if (method === "POST" && pathname === "/api/relay") {
    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch (err) {
      return sendJsonError(res, 413, err.message, "invalid_request_error");
    }
    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return sendJsonError(res, 400, "Malformed JSON", "invalid_request_error");
    }

    try {
      let result;
      switch (body.action) {
        case "toggle":
          result = setRelayEnabled(body.enabled);
          break;
        case "add":
          result = addRelay(body.url, body.label);
          break;
        case "use":
          result = setActiveRelay(body.url);
          break;
        case "remove":
          result = removeRelay(body.url);
          break;
        default:
          return sendJsonError(res, 400, "Unknown relay action. Allowed: toggle, add, use, remove", "invalid_request_error");
      }
      const resJson = JSON.stringify(result);
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "content-length": Buffer.byteLength(resJson),
      });
      return res.end(resJson);
    } catch (err) {
      return sendJsonError(res, 400, err.message, "invalid_request_error");
    }
  }

  // Authentication check for /v1/* endpoints
  if (pathname.startsWith("/v1")) {
    const authResult = validateLocalAuth(req);
    if (!authResult.valid) {
      return sendJsonError(res, 401, authResult.message, "authentication_error", "invalid_api_key");
    }
  }

  // GET /v1/status
  if (method === "GET" && pathname === "/v1/status") {
    const alive = getAliveCatalog();
    const stats = getRelayStats();
    const body = JSON.stringify({
      status: "active",
      models: alive.map((m) => ({ id: m.id, name: m.name, source: m.source })),
      relay: stats,
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-length": Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // GET /v1/models
  if (method === "GET" && pathname === "/v1/models") {
    const alive = getAliveCatalog();
    const body = JSON.stringify({
      object: "list",
      data: alive.map((m) => ({
        id: m.id,
        object: "model",
        created: 1700000000,
        owned_by: m.source === "kilo" ? "kilocode" : "opencode",
        permission: [],
        context_window: m.contextWindow,
        max_tokens: m.maxTokens,
        reasoning: m.reasoning,
      })),
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-length": Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // GET /v1/models/:model
  if (method === "GET" && pathname.startsWith("/v1/models/")) {
    const modelId = decodeURIComponent(pathname.slice("/v1/models/".length));
    const model = findModel(modelId);
    if (!model) {
      return sendJsonError(res, 404, `Model '${modelId}' not found`, "invalid_request_error", "model_not_found");
    }
    const body = JSON.stringify({
      id: model.id,
      object: "model",
      created: 1700000000,
      owned_by: model.source === "kilo" ? "kilocode" : "opencode",
      context_window: model.contextWindow,
      max_tokens: model.maxTokens,
      reasoning: model.reasoning,
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "content-length": Buffer.byteLength(body),
    });
    return res.end(body);
  }

  // POST /v1/chat/completions or POST /v1/responses
  if (method === "POST" && (pathname === "/v1/chat/completions" || pathname === "/v1/responses")) {
    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch (err) {
      return sendJsonError(res, 413, err.message, "invalid_request_error");
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return sendJsonError(res, 400, "Malformed JSON request body", "invalid_request_error");
    }

    const requestedModel = parsedBody?.model;
    if (!requestedModel || typeof requestedModel !== "string") {
      return sendJsonError(res, 400, "Missing required 'model' parameter", "invalid_request_error");
    }

    const clientIP = getClientIP(req);
    const isKilo = KILO_MODEL_IDS.has(requestedModel) || findModel(requestedModel)?.source === "kilo";
    const upstream = isKilo ? "kilo" : "opencode";

    // Rate Limit Check
    const rateCheck = checkRateLimit(clientIP, upstream);
    if (!rateCheck.allowed) {
      log("warn", "Rate limit exceeded", { ip: clientIP, upstream });
      const resetSec = Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000));
      res.setHeader("Retry-After", String(resetSec));
      return sendJsonError(res, 429, `${upstream} rate limit exceeded. Try again in ${resetSec}s`, "rate_limit_error", "rate_limit_exceeded");
    }

    const clientWantsStream = parsedBody.stream === true;

    try {
      if (isKilo) {
        // KiloCode Gateway
        const targetUrl = config.kiloChatUrl;
        const upstreamResponse = await relayFetch(targetUrl, {
          method: "POST",
          headers: kiloHeaders(),
          body: JSON.stringify(parsedBody),
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        if (!upstreamResponse.ok) {
          const errText = await upstreamResponse.text().catch(() => "Unknown upstream error");
          return sendJsonError(res, upstreamResponse.status, `Kilo upstream error: ${errText}`, "api_error");
        }

        if (clientWantsStream && upstreamResponse.body) {
          return pipeUpstreamStream(upstreamResponse.body, res, req, upstreamResponse.status);
        }

        // Non-streaming response handling
        const contentType = upstreamResponse.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream") && upstreamResponse.body) {
          const aggregated = await aggregateStreamToResponse(upstreamResponse.body, requestedModel);
          const bodyJson = JSON.stringify(aggregated);
          res.writeHead(200, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(bodyJson),
            "access-control-allow-origin": "*",
          });
          return res.end(bodyJson);
        }

        const data = await upstreamResponse.text();
        res.writeHead(upstreamResponse.status, {
          "content-type": contentType || "application/json",
          "access-control-allow-origin": "*",
        });
        return res.end(data);
      } else {
        // OpenCode Zen
        transformOpencodeBody(parsedBody);

        const relayStats = getRelayStats();
        if (relayStats.enabled && relayStats.url) {
          const maxTok = parsedBody.max_tokens ?? parsedBody.max_output_tokens;
          if (typeof maxTok === "number" && maxTok > config.relayMaxTokens) {
            if ("max_output_tokens" in parsedBody) {
              parsedBody.max_output_tokens = config.relayMaxTokens;
            } else {
              parsedBody.max_tokens = config.relayMaxTokens;
            }
          }
        }

        const isResponsesEndpoint = pathname === "/v1/responses" || (parsedBody.input && !parsedBody.messages);
        const targetPath = isResponsesEndpoint ? "/v1/responses" : "/v1/chat/completions";
        const fullUrl = `${config.upstreamOpenCode}${targetPath}`;

        const headers = opencodeHeaders();
        headers["content-type"] = "application/json";

        const upstreamResponse = await relayFetch(fullUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(parsedBody),
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        if (!upstreamResponse.ok) {
          const errText = await upstreamResponse.text().catch(() => "Unknown upstream error");
          return sendJsonError(res, upstreamResponse.status, `OpenCode upstream error: ${errText}`, "api_error");
        }

        if (clientWantsStream && upstreamResponse.body) {
          return pipeUpstreamStream(upstreamResponse.body, res, req, upstreamResponse.status);
        }

        // Upstream OpenCode always streams; aggregate to standard JSON if client asked for non-stream
        if (upstreamResponse.body) {
          const aggregated = await aggregateStreamToResponse(upstreamResponse.body, requestedModel);
          const bodyJson = JSON.stringify(aggregated);
          res.writeHead(200, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(bodyJson),
            "access-control-allow-origin": "*",
          });
          return res.end(bodyJson);
        }

        const data = await upstreamResponse.text();
        res.writeHead(upstreamResponse.status, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
        return res.end(data);
      }
    } catch (err) {
      log("error", "Proxy execution error", { error: err.message, stack: err.stack });
      return sendJsonError(res, 502, `Proxy error: ${err.message}`, "api_error");
    }
  }

  // Not Found
  return sendJsonError(res, 404, `Endpoint ${pathname} not found`, "invalid_request_error");
}

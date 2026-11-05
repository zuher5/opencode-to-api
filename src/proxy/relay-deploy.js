import { randomBytes } from "node:crypto";

const VERCEL_API = "https://api.vercel.com";
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

const VERCEL_RELAY_WORKER = `// Only the 2 upstreams pi-bansos talks to. Anything else = open proxy abuse.
const ALLOWED_TARGETS = ["https://opencode.ai", "https://api.kilo.ai"];
export const config = { runtime: "edge" };
export default async function handler(req) {
  const target = req.headers.get("x-relay-target");
  const relayPath = req.headers.get("x-relay-path") || "/";
  if (!target) return new Response(JSON.stringify({ error: "Missing x-relay-target header" }), { status: 400, headers: { "content-type": "application/json" } });
  const cleanTarget = target.replace(/\\/$/, "");
  if (!ALLOWED_TARGETS.includes(cleanTarget)) return new Response(JSON.stringify({ error: "Forbidden target" }), { status: 403, headers: { "content-type": "application/json" } });
  if (!relayPath.startsWith("/")) return new Response(JSON.stringify({ error: "Bad path" }), { status: 400, headers: { "content-type": "application/json" } });
  const targetUrl = cleanTarget + relayPath;
  const headers = new Headers(req.headers);
  headers.delete("x-relay-target"); headers.delete("x-relay-path"); headers.delete("host");
  const response = await fetch(targetUrl, { method: req.method, headers, body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined, duplex: "half" });
  return new Response(response.body, { status: response.status, headers: response.headers });
}`;

export async function deployVercelRelay(token, name = "opencode-relay", onProgress = null) {
  const auth = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  onProgress?.("Uploading relay to Vercel…");
  const dep = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name,
      files: [
        { file: "api/relay.js", data: VERCEL_RELAY_WORKER },
        {
          file: "package.json",
          data: JSON.stringify({ name, version: "1.0.0" }),
        },
        {
          file: "vercel.json",
          data: JSON.stringify({
            rewrites: [{ source: "/(.*)", destination: "/api/relay" }],
          }),
        },
      ],
      projectSettings: { framework: null },
      target: "production",
    }),
  });
  if (!dep.ok) {
    const e = await dep.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Vercel deploy failed (HTTP ${dep.status})`);
  }
  const depJson = await dep.json();
  const depId = depJson.id || depJson.uid;
  const projectId = depJson.projectId || name;

  await fetch(`${VERCEL_API}/v9/projects/${projectId}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ ssoProtection: null }),
  });

  onProgress?.("Waiting for deployment to go live…");
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await fetch(`${VERCEL_API}/v13/deployments/${depId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await s.json();
    if (j.readyState === "READY") return `https://${j.url}`;
    if (j.readyState === "ERROR" || j.readyState === "CANCELED") {
      throw new Error(`Deployment failed: ${j.readyState}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Deployment timed out (120s)");
}

function cloudflareScriptName(name) {
  const slug = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58);
  return slug || `bansos-relay-${Date.now().toString(36)}`;
}

function buildCloudflareRelayWorker(relayAuth) {
  return `// pi-bansos relay (cloudflare). Allowlist only — anything else is abuse.
const ALLOWED_TARGETS = ["https://opencode.ai", "https://api.kilo.ai"];
const RELAY_AUTH = ${JSON.stringify(relayAuth)};
const DENY_HEADERS = ["host", "connection", "content-length", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "transfer-encoding", "te", "trailer", "upgrade", "x-relay-target", "x-relay-path"];
function timingSafeEqualStr(a, b) {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
const json = (error, status) => new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
export default {
  async fetch(request) {
    if (!["GET", "POST", "HEAD", "OPTIONS"].includes(request.method)) return json("Method Not Allowed", 405);
    if (Number(request.headers.get("content-length") || 0) > 32 * 1024 * 1024) return json("Payload Too Large", 413);
    if (!RELAY_AUTH || !timingSafeEqualStr(request.headers.get("x-relay-auth") || "", RELAY_AUTH)) return json("unauthorized", 401);
    const target = request.headers.get("x-relay-target");
    if (!target) return json("Missing x-relay-target header", 400);
    let targetUrl;
    try { targetUrl = new URL(target); } catch { return json("invalid x-relay-target", 400); }
    if (targetUrl.protocol !== "https:") return json("forbidden x-relay-target protocol", 403);
    if (targetUrl.username || targetUrl.password) return json("forbidden x-relay-target (embedded credentials)", 403);
    const host = targetUrl.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".internal."))
      return json("forbidden x-relay-target (private/loopback host)", 403);
    if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")))
      return json("forbidden x-relay-target (private/loopback host)", 403);
    const v4 = host.match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/);
    if (v4) {
      const [a, b] = [Number(v4[1]), Number(v4[2])];
      if (a === 0 || a === 10 || a === 127) return json("forbidden x-relay-target (private/loopback host)", 403);
      if (a === 169 && b === 254) return json("forbidden x-relay-target (private/loopback host)", 403);
      if (a === 192 && b === 168) return json("forbidden x-relay-target (private/loopback host)", 403);
      if (a === 172 && b >= 16 && b <= 31) return json("forbidden x-relay-target (private/loopback host)", 403);
      if (a === 100 && b >= 64 && b <= 127) return json("forbidden x-relay-target (private/loopback host)", 403);
    }
    const cleanTarget = target.replace(/\\/$/, "");
    if (!ALLOWED_TARGETS.includes(cleanTarget)) return json("Forbidden target", 403);
    const relayPath = request.headers.get("x-relay-path") || "/";
    if (typeof relayPath !== "string" || relayPath.includes("@") || relayPath.includes("\\\\") || !relayPath.startsWith("/"))
      return json("forbidden x-relay-path", 403);
    let finalUrl;
    try { finalUrl = new URL(relayPath, targetUrl); } catch { return json("forbidden x-relay-path", 403); }
    if (finalUrl.hostname !== targetUrl.hostname || finalUrl.protocol !== targetUrl.protocol || finalUrl.port !== targetUrl.port || finalUrl.username || finalUrl.password)
      return json("forbidden x-relay-path (host mismatch)", 403);
    const headers = new Headers(request.headers);
    for (const h of DENY_HEADERS) headers.delete(h);
    headers.delete("x-relay-auth");
    try {
      const init = { method: request.method, headers };
      if (request.method !== "GET" && request.method !== "HEAD") { init.body = request.body; init.duplex = "half"; }
      const response = await fetch(finalUrl.toString(), init);
      return new Response(response.body, { status: response.status, headers: response.headers });
    } catch (error) {
      return json(String(error), 502);
    }
  },
};`;
}

async function cloudflareError(action, res) {
  const j = await res.json().catch(() => ({}));
  const detail =
    j.errors
      ?.map((e) => e.message)
      .filter(Boolean)
      .join("; ") || `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) {
    return new Error(
      `Cloudflare authentication failed while trying to ${action}: ${detail}. Check that your API token is valid and has Workers permissions.`,
    );
  }
  if (res.status === 429) {
    return new Error(
      `Cloudflare plan or usage limit hit while trying to ${action}: ${detail}. Check your Workers plan limits.`,
    );
  }
  return new Error(`Failed to ${action} (HTTP ${res.status}): ${detail}`);
}

export async function deployCloudflareRelay(token, name = "opencode-relay", onProgress = null) {
  const auth = { Authorization: `Bearer ${token}` };
  const scriptName = cloudflareScriptName(name);

  onProgress?.("Resolving Cloudflare account…");
  const accRes = await fetch(`${CLOUDFLARE_API}/accounts`, { headers: auth });
  if (!accRes.ok) throw await cloudflareError("resolve Cloudflare account", accRes);
  const accJson = await accRes.json();
  const accountId = accJson.result?.[0]?.id;
  if (!accountId) throw new Error("No Cloudflare account is accessible with this API token");

  onProgress?.("Uploading relay worker to Cloudflare…");
  const relayAuth = randomBytes(32).toString("hex");
  const formData = new FormData();
  formData.append(
    "index.js",
    new Blob([buildCloudflareRelayWorker(relayAuth)], {
      type: "application/javascript+module",
    }),
    "index.js",
  );
  formData.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          main_module: "index.js",
          compatibility_date: "2024-03-20",
          observability: { enabled: true },
        }),
      ],
      { type: "application/json" },
    ),
    "metadata.json",
  );
  const uploadRes = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/workers/scripts/${scriptName}`,
    { method: "PUT", headers: auth, body: formData },
  );
  if (!uploadRes.ok) throw await cloudflareError("upload Worker to Cloudflare", uploadRes);

  try {
    await fetch(
      `${CLOUDFLARE_API}/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      },
    );
  } catch {}

  onProgress?.("Reading workers.dev routing…");
  const deleteScript = () =>
    fetch(
      `${CLOUDFLARE_API}/accounts/${accountId}/workers/scripts/${scriptName}`,
      { method: "DELETE", headers: auth },
    ).catch(() => undefined);

  let subRes;
  try {
    subRes = await fetch(`${CLOUDFLARE_API}/accounts/${accountId}/workers/subdomain`, {
      headers: auth,
    });
  } catch (e) {
    await deleteScript();
    throw e;
  }
  if (!subRes.ok) {
    const err = await cloudflareError("retrieve workers.dev subdomain", subRes);
    await deleteScript();
    throw err;
  }
  const subJson = await subRes.json();
  const subdomain = subJson.result?.subdomain;
  if (!subdomain) {
    await deleteScript();
    throw new Error(
      "Worker deployed but workers.dev subdomain is unavailable. Enable a workers.dev subdomain for your account in the Cloudflare dashboard.",
    );
  }
  onProgress?.("Relay live — you're behind Cloudflare's egress now");
  return { url: `https://${scriptName}.${subdomain}.workers.dev`, auth: relayAuth };
}

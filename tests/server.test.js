import test from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer } from "../src/server.js";
import { getLocalApiKey } from "../src/auth/local-auth.js";

test("Server Endpoints - HTTP API Testing", async (t) => {
  const { server, port, host } = await startServer(18990);
  const baseUrl = `http://${host}:${port}`;
  const apiKey = getLocalApiKey();

  t.after(async () => {
    await stopServer(server);
  });

  // 1. GET /health (unauthenticated)
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, "ok");
  assert.ok(healthData.modelsCount > 0);

  // 2. GET /v1/models (without auth -> 401)
  const unauthRes = await fetch(`${baseUrl}/v1/models`);
  assert.equal(unauthRes.status, 401);
  const unauthData = await unauthRes.json();
  assert.equal(unauthData.error?.type, "authentication_error");

  // 3. GET /v1/models (with auth -> 200)
  const modelsRes = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  assert.equal(modelsRes.status, 200);
  const modelsData = await modelsRes.json();
  assert.equal(modelsData.object, "list");
  assert.ok(Array.isArray(modelsData.data));
  assert.ok(modelsData.data.length > 0);

  // 4. GET /v1/models/:model (known model -> 200)
  const singleModelRes = await fetch(`${baseUrl}/v1/models/kilo-auto/free`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  assert.equal(singleModelRes.status, 200);
  const singleModelData = await singleModelRes.json();
  assert.equal(singleModelData.id, "kilo-auto/free");

  // 5. GET /v1/models/:model (unknown model -> 404)
  const missingModelRes = await fetch(`${baseUrl}/v1/models/unknown-xyz`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  assert.equal(missingModelRes.status, 404);

  // 6. POST /v1/chat/completions (missing body -> 400)
  const emptyPostRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(emptyPostRes.status, 400);

  // 7. OPTIONS /v1/chat/completions (CORS preflight -> 204)
  const optionsRes = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "OPTIONS",
  });
  assert.equal(optionsRes.status, 204);
  assert.equal(optionsRes.headers.get("access-control-allow-origin"), "*");
});

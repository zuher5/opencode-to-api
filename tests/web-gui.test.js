import test from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer } from "../src/server.js";

test("Web GUI & Relay API endpoints", async (t) => {
  const { server, port, host } = await startServer(18992);
  const baseUrl = `http://${host}:${port}`;

  t.after(async () => {
    await stopServer(server);
  });

  // 1. GET / (Web GUI HTML)
  const guiRes = await fetch(`${baseUrl}/`);
  assert.equal(guiRes.status, 200);
  assert.ok(guiRes.headers.get("content-type")?.includes("text/html"));
  const html = await guiRes.text();
  assert.ok(html.includes("OpenCode-to-API Dashboard & Playground"));
  assert.ok(html.includes("tab-playground"));

  // 2. GET /api/info
  const infoRes = await fetch(`${baseUrl}/api/info`);
  assert.equal(infoRes.status, 200);
  const info = await infoRes.json();
  assert.equal(info.status, "ok");
  assert.ok(info.apiKey);
  assert.ok(typeof info.modelsCount === "number");

  // 3. GET /api/relay
  const relayRes = await fetch(`${baseUrl}/api/relay`);
  assert.equal(relayRes.status, 200);
  const relayData = await relayRes.json();
  assert.equal(typeof relayData.enabled, "boolean");
  assert.ok(Array.isArray(relayData.relays));

  // 4. POST /api/relay (add relay)
  const addRes = await fetch(`${baseUrl}/api/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "add",
      url: "https://custom-relay-worker.vercel.app",
      label: "Custom Worker Test",
    }),
  });
  assert.equal(addRes.status, 200);
  const addData = await addRes.json();
  const added = addData.relays.find((r) => r.url === "https://custom-relay-worker.vercel.app");
  assert.ok(added, "Relay should be in saved list");
  assert.equal(added.label, "Custom Worker Test");

  // 5. POST /api/relay (toggle relay)
  const toggleRes = await fetch(`${baseUrl}/api/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle", enabled: true }),
  });
  assert.equal(toggleRes.status, 200);
  const toggleData = await toggleRes.json();
  assert.equal(toggleData.enabled, true);

  // 6. POST /api/relay (remove relay)
  const removeRes = await fetch(`${baseUrl}/api/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "remove",
      url: "https://custom-relay-worker.vercel.app",
    }),
  });
  assert.equal(removeRes.status, 200);
  const removeData = await removeRes.json();
  const stillExists = removeData.relays.find((r) => r.url === "https://custom-relay-worker.vercel.app");
  assert.equal(stillExists, undefined, "Relay should be removed");
});

import test from "node:test";
import assert from "node:assert/strict";
import { getAliveCatalog, findModel, modelsFromCache } from "../src/catalog/discovery.js";
import { OPENCODE_MODELS, KILO_MODELS } from "../src/catalog/definitions.js";

test("Catalog - Models definition and discovery", () => {
  const catalog = getAliveCatalog();
  assert.ok(catalog.length >= 20, "Should have at least 20 models defined");

  // Check an OpenCode model
  const nemotron = findModel("nemotron-3-ultra-free");
  assert.ok(nemotron);
  assert.equal(nemotron.source, "opencode");
  assert.equal(nemotron.contextWindow, 1_000_000);

  // Check a Kilo model
  const kiloAuto = findModel("kilo-auto/free");
  assert.ok(kiloAuto);
  assert.equal(kiloAuto.source, "kilo");

  // Check nonexistent model
  const missing = findModel("non-existent-model");
  assert.equal(missing, null);
});

test("Catalog - Fallback when cache is empty", () => {
  const emptyCache = { fetchedAt: 0, opencode: [], kilo: [] };
  const models = modelsFromCache(emptyCache);
  assert.ok(models.length >= 20, "Fallback should provide all known models");
});

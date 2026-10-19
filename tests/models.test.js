import test from "node:test";
import assert from "node:assert/strict";
import { getAliveCatalog, findModel, modelsFromCache } from "../src/catalog/discovery.js";
import {
  OPENCODE_MODELS,
  KILO_MODELS,
  ALL_KNOWN_MODELS,
  KILO_MODEL_IDS,
} from "../src/catalog/definitions.js";

test("Catalog - Models definition and discovery", () => {
  const catalog = getAliveCatalog();
  assert.equal(catalog.length, 32, "Should have exactly 32 curated models");
  assert.equal(OPENCODE_MODELS.length, 16, "Should have 16 OpenCode models");
  assert.equal(KILO_MODELS.length, 16, "Should have 16 Kilo models");

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

test("Catalog - 8 New free models register and route correctly (v0.6.4)", () => {
  const newOpencode = [
    "deepseek-v4.1-flash-free",
    "glm-5.3-flash-free",
    "cat-jam-free",
    "ll-alpha-free",
    "nemotron-3.5-super-vl-free",
  ];
  const newKilo = [
    "nvidia/nemotron-3.5-super-vl:free",
    "stealth/glyph-cluster",
    "stealth/cat-jam",
  ];

  const models = modelsFromCache({
    fetchedAt: 1,
    opencode: newOpencode,
    kilo: newKilo,
  });

  for (const id of newOpencode) {
    assert.ok(OPENCODE_MODELS.some((m) => m.id === id), `Missing OpenCode model ${id}`);
    const resolved = models.find((m) => m.id === id);
    assert.equal(resolved?.source, "opencode");
    assert.equal(KILO_MODEL_IDS.has(id), false);
  }

  for (const id of newKilo) {
    assert.ok(KILO_MODELS.some((m) => m.id === id), `Missing Kilo model ${id}`);
    const resolved = models.find((m) => m.id === id);
    assert.equal(resolved?.source, "kilo");
    assert.equal(KILO_MODEL_IDS.has(id), true);
  }

  // Muse retains Responses API
  for (const model of OPENCODE_MODELS.filter((m) => m.id.startsWith("muse-spark"))) {
    assert.equal(model.api, "openai-responses");
  }

  // Paid IDs stay excluded
  for (const id of ["deepseek-v4.1-flash", "glm-5.3-flash"]) {
    assert.equal(ALL_KNOWN_MODELS.some((m) => m.id === id), false);
  }

  // Swapped cache: only pinned openrouter/free survives
  const swapped = modelsFromCache({
    fetchedAt: 1,
    opencode: newKilo,
    kilo: newOpencode,
  });
  assert.equal(swapped.length, 1);
  assert.equal(swapped[0].id, "openrouter/free");
});

test("Catalog - Fallback when cache is empty", () => {
  const emptyCache = { fetchedAt: 0, opencode: [], kilo: [] };
  const models = modelsFromCache(emptyCache);
  assert.equal(models.length, 32, "Fallback should provide all 32 known models");
});

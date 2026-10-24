import test from "node:test";
import assert from "node:assert/strict";
import { getAliveCatalog, findModel, modelsFromCache } from "../src/catalog/discovery.js";
import {
  OPENCODE_MODELS,
  KILO_MODELS,
  ALL_KNOWN_MODELS,
  KILO_MODEL_IDS,
  OPENCODE_MODEL_IDS,
  OPENCODE_RESPONSES_MODELS,
} from "../src/catalog/definitions.js";

test("Catalog - Models definition and discovery", () => {
  const catalog = getAliveCatalog();
  assert.equal(catalog.length, 25, "Should have exactly 25 curated models (v0.7.1 sweep)");
  assert.equal(OPENCODE_MODELS.length, 11, "Should have 11 OpenCode models");
  assert.equal(KILO_MODELS.length, 14, "Should have 14 Kilo models");

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

  // No duplicate ids across providers
  const ids = ALL_KNOWN_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "Model ids must be unique");
  assert.equal(OPENCODE_MODEL_IDS.size, OPENCODE_MODELS.length);
  assert.equal(KILO_MODEL_IDS.size, KILO_MODELS.length);
});

test("Catalog - v0.7.1 sweep: additions register and route correctly", () => {
  const newOpencode = ["beam-free", "minimax-m3.1-flash-free"];
  const newKilo = [
    "minimax/minimax-m3.1-flash:free",
    "xingchen-agi/xing4.0-29b-a4b:free",
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

test("Catalog - v0.7.1 sweep: dead upstream models are dropped", () => {
  // OpenCode: 410/400 upstream (see pi-bansos v0.7.0 sweep notes)
  const droppedOpencode = [
    "muse-spark-1.3-contributor-free",
    "muse-spark-1.2-contributor-free",
    "space-bunny-free",
    "ll-alpha-free",
    "step-5-preview-free",
    "ling-3.0-flash-fin-free",
    "ling-3.1-flash-free",
  ];
  // Kilo: 401 paid-model, 429 shared pool, 504 upstream
  const droppedKilo = [
    "stealth/cat-jam",
    "stealth/glyph-cluster",
    "poolside/laguna-xs-2.1:free",
    "liquid/lfm-2.5-2.6b:free",
  ];

  for (const id of [...droppedOpencode, ...droppedKilo]) {
    assert.equal(
      ALL_KNOWN_MODELS.some((m) => m.id === id),
      false,
      `Dropped model ${id} must not be registered`,
    );
  }

  // muse-spark class is gone, so nothing is pinned to the Responses endpoint
  assert.equal(OPENCODE_RESPONSES_MODELS.size, 0);
});

test("Catalog - Fallback when cache is empty", () => {
  const emptyCache = { fetchedAt: 0, opencode: [], kilo: [] };
  const models = modelsFromCache(emptyCache);
  assert.equal(models.length, 25, "Fallback should provide all 25 known models");
});

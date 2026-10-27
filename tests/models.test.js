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

test("Catalog - Models definition and discovery (v0.7.2 sweep)", () => {
  const catalog = getAliveCatalog();
  assert.equal(catalog.length, 21, "Should have exactly 21 curated models (v0.7.2 sweep)");
  assert.equal(OPENCODE_MODELS.length, 8, "Should have 8 OpenCode models");
  assert.equal(KILO_MODELS.length, 13, "Should have 13 Kilo models");

  // Check an OpenCode model
  const beam = findModel("beam-free");
  assert.ok(beam);
  assert.equal(beam.source, "opencode");
  assert.equal(beam.contextWindow, 262_144);

  // Check DeepSeek context bump (320k)
  const deepseek = findModel("deepseek-v4.1-flash-free");
  assert.ok(deepseek);
  assert.equal(deepseek.contextWindow, 320_000);
  assert.equal(deepseek.maxTokens, 64_000);

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

test("Catalog - v0.7.2 additions register and route correctly", () => {
  const newOpencode = ["flint-40b-free"];
  const newKilo = ["recursive/flint-v1.0:free"];

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
});

test("Catalog - curated list is authoritative, not the live catalog", () => {
  // A cache that lists only a subset must not hide the other curated models.
  const liveCache = { fetchedAt: 1, opencode: ["beam-free"], kilo: ["kilo-auto/free"] };
  const models = modelsFromCache(liveCache);
  assert.equal(models.length, 21);

  // Online and offline starts must expose the same catalog.
  const offline = modelsFromCache({ fetchedAt: 0 });
  assert.deepEqual(
    models.map((m) => m.id),
    offline.map((m) => m.id),
    "online and offline catalog must match",
  );

  // A cache listing unknown/foreign ids adds nothing.
  const foreign = modelsFromCache({
    fetchedAt: 1,
    opencode: ["not-a-real-model"],
    kilo: ["also/fake:free"],
  });
  assert.equal(foreign.length, 21);
});

test("Catalog - v0.7.2 sweep: dead upstream models are dropped", () => {
  // OpenCode: dropped upstream / absent from catalog
  const droppedOpencode = [
    "minimax-m3.1-flash-free",
    "nemotron-3-ultra-free",
    "longcat-2.5-preview-free",
    "cat-jam-free",
    "muse-spark-1.3-contributor-free",
    "muse-spark-1.2-contributor-free",
    "space-bunny-free",
    "ll-alpha-free",
    "step-5-preview-free",
    "ling-3.0-flash-fin-free",
    "ling-3.1-flash-free",
  ];
  // Kilo: 404 / 401 / 429
  const droppedKilo = [
    "minimax/minimax-m3.1-flash:free",
    "thinkingmachines/inkling-small:free",
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
  assert.equal(models.length, 21, "Fallback should provide all 21 known models");
});

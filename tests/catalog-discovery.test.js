import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalogData, isTrustedCatalogBaseUrl } from "../src/catalog/discovery.js";

test("Catalog Discovery - isTrustedCatalogBaseUrl allows opencode.ai domains only", () => {
  assert.equal(isTrustedCatalogBaseUrl("https://opencode.ai/inference/openai/v1"), true);
  assert.equal(isTrustedCatalogBaseUrl("https://models.opencode.ai/api.json"), true);
  assert.equal(isTrustedCatalogBaseUrl("https://sub.domain.opencode.ai/"), true);
  assert.equal(isTrustedCatalogBaseUrl("https://evil.com/fake-opencode.ai"), false);
  assert.equal(isTrustedCatalogBaseUrl("http://insecure-opencode.ai"), false);
});

test("Catalog Discovery - parseCatalogData extracts free models, facts, and families", () => {
  const sampleData = {
    opencode: {
      api: "https://opencode.ai/inference/openai/v1",
      models: {
        "beam-free": {
          cost: { input: 0, output: 0 },
          status: "active",
          tool_call: true,
          reasoning: true,
          family: "beam",
          limit: { context: 1048576, output: 131072 },
        },
        "mimo-v2.6-flash-free": {
          cost: { input: 0, output: 0 },
          status: "active",
          tool_call: true,
          reasoning: true,
          family: "mimo",
          limit: { context: 200000, output: 32000 },
        },
        "paid-model": {
          cost: { input: 0.05, output: 0.1 },
          status: "active",
          tool_call: true,
        },
        "deprecated-free": {
          cost: { input: 0, output: 0 },
          status: "deprecated",
          tool_call: true,
        },
      },
    },
  };

  const parsed = parseCatalogData(sampleData);
  assert.equal(parsed.catalogBase, "https://opencode.ai/inference/openai/v1");
  assert.equal(parsed.chatUrl, "https://opencode.ai/inference/openai/v1/chat/completions");
  assert.equal(parsed.responsesUrl, "https://opencode.ai/inference/openai/v1/responses");

  // Free models must only include zero-cost, non-deprecated models
  assert.deepEqual(parsed.freeModels, ["beam-free", "mimo-v2.6-flash-free"]);

  // Model facts must be extracted
  assert.equal(parsed.modelFacts["beam-free"].reasoning, true);
  assert.equal(parsed.modelFacts["beam-free"].maxOutput, 131072);
  assert.equal(parsed.modelFacts["beam-free"].contextWindow, 1048576);

  // Model family aliases must be extracted
  assert.equal(parsed.modelFamilies["beam"], "beam-free");
  assert.equal(parsed.modelFamilies["mimo"], "mimo-v2.6-flash-free");
});

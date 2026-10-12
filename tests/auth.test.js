import test from "node:test";
import assert from "node:assert/strict";
import { initLocalAuth, getLocalApiKey, validateLocalAuth } from "../src/auth/local-auth.js";

test("Local Auth - key generation and validation", () => {
  const key = initLocalAuth();
  assert.ok(key.startsWith("sk-local-"), "Key should start with sk-local-");
  assert.equal(key, getLocalApiKey(), "Key should be consistent across calls");

  // Valid Bearer
  const validReq = {
    headers: { authorization: `Bearer ${key}` },
    url: "/v1/models",
  };
  const result1 = validateLocalAuth(validReq);
  assert.equal(result1.valid, true);

  // Invalid Bearer
  const invalidReq = {
    headers: { authorization: "Bearer sk-invalid-key" },
    url: "/v1/models",
  };
  const result2 = validateLocalAuth(invalidReq);
  assert.equal(result2.valid, false);

  // Missing Authorization
  const missingReq = {
    headers: {},
    url: "/v1/models",
  };
  const result3 = validateLocalAuth(missingReq);
  assert.equal(result3.valid, false);

  // Query parameter api_key
  const queryReq = {
    headers: {},
    url: `/v1/models?api_key=${key}`,
  };
  const result4 = validateLocalAuth(queryReq);
  assert.equal(result4.valid, true);
});

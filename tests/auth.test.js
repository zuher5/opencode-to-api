import test from "node:test";
import assert from "node:assert/strict";
import { initLocalAuth, getLocalApiKey, validateLocalAuth } from "../src/auth/local-auth.js";

const EXPECTED_KEY = "sk-2004";

test("Local Auth - fixed local API key and validation", () => {
  const key = initLocalAuth();
  assert.equal(key, EXPECTED_KEY, "Local API key should be sk-2004");
  assert.equal(key, getLocalApiKey(), "Key should be consistent across calls");

  // Valid Bearer
  const validReq = {
    headers: { authorization: `Bearer ${key}` },
    url: "/v1/models",
  };
  assert.equal(validateLocalAuth(validReq).valid, true);

  // Valid x-api-key header
  const headerReq = {
    headers: { "x-api-key": key },
    url: "/v1/models",
  };
  assert.equal(validateLocalAuth(headerReq).valid, true);

  // Invalid Bearer
  const invalidReq = {
    headers: { authorization: "Bearer sk-invalid-key" },
    url: "/v1/models",
  };
  assert.equal(validateLocalAuth(invalidReq).valid, false);

  // Legacy generated keys are no longer accepted
  const legacyReq = {
    headers: { authorization: "Bearer sk-local-deadbeef" },
    url: "/v1/models",
  };
  assert.equal(validateLocalAuth(legacyReq).valid, false);

  // Missing Authorization
  const missingReq = {
    headers: {},
    url: "/v1/models",
  };
  assert.equal(validateLocalAuth(missingReq).valid, false);

  // Query parameter api_key
  const queryReq = {
    headers: {},
    url: `/v1/models?api_key=${key}`,
  };
  assert.equal(validateLocalAuth(queryReq).valid, true);

  // Case/whitespace must not be forgiven
  const wrongCaseReq = {
    headers: { authorization: "Bearer SK-2004" },
    url: "/v1/models",
  };
  assert.equal(validateLocalAuth(wrongCaseReq).valid, false);
});

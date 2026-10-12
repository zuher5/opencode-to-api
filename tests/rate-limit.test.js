import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../src/proxy/rate-limit.js";

test("Rate Limiter - bucket counting and ceiling", () => {
  const testIp = `192.168.1.${Math.floor(Math.random() * 250) + 1}`;

  // First request should be allowed
  const first = checkRateLimit(testIp, "kilo");
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 199);

  // Subsequent request
  const second = checkRateLimit(testIp, "kilo");
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 198);
});

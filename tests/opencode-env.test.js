import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureEnvFingerprint,
  ENV_FINGERPRINT_NOTE,
  systemCarriesEnv,
  currentOpenCodeSession,
  generateSessionId,
  OPENCODE_SESSION_RE,
} from "../src/adapters/opencode-zen.js";

test("opencode-env: session freshness and format", () => {
  const session = currentOpenCodeSession();
  assert.ok(OPENCODE_SESSION_RE.test(session), `Session ${session} must match OPENCODE_SESSION_RE`);

  const fresh = generateSessionId();
  assert.ok(OPENCODE_SESSION_RE.test(fresh));
  assert.ok(fresh.startsWith("ses_"));
});

test("opencode-env: systemCarriesEnv detector", () => {
  assert.equal(systemCarriesEnv("plain text"), false);
  assert.equal(systemCarriesEnv("has <env> block inside"), true);
  assert.equal(systemCarriesEnv([{ type: "text", text: "hello <env> world" }]), true);
  assert.equal(systemCarriesEnv([{ type: "text", text: "no block" }]), false);
  assert.equal(systemCarriesEnv(null), false);
  assert.equal(systemCarriesEnv(undefined), false);
});

test("opencode-env: chat appends the <env> block to the existing system message", () => {
  const body = {
    messages: [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "hi" },
    ],
  };
  ensureEnvFingerprint(body, false);
  const sys = body.messages[0];
  assert.ok(sys.content.startsWith("You are helpful."));
  assert.ok(sys.content.includes("<env>"));
  assert.ok(sys.content.includes("</env>"));
  assert.ok(sys.content.includes(`Working directory: ${process.cwd()}`));
  assert.ok(sys.content.includes(`Platform: ${process.platform}`));
  // User message stays untouched and intact
  assert.equal(body.messages[1].content, "hi");
});

test("opencode-env: chat unshifts a system message when none exists", () => {
  const body = { messages: [{ role: "user", content: "hi" }] };
  ensureEnvFingerprint(body, false);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, ENV_FINGERPRINT_NOTE);
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[1].content, "hi");
});

test("opencode-env: chat prompt already carrying <env> passes through untouched", () => {
  const content = "agent prompt\n<env>\n  Platform: linux\n</env>";
  const body = {
    messages: [
      { role: "system", content },
      { role: "user", content: "hi" },
    ],
  };
  ensureEnvFingerprint(body, false);
  assert.equal(body.messages[0].content, content);

  const blocked = {
    messages: [{ role: "system", content: [{ type: "text", text: "x <env> y" }] }],
  };
  ensureEnvFingerprint(blocked, false);
  assert.equal(blocked.messages[0].content.length, 1);
});

test("opencode-env: chat block-array system content gets note appended as a text block", () => {
  const body = {
    messages: [{ role: "system", content: [{ type: "text", text: "You are helpful." }] }],
  };
  ensureEnvFingerprint(body, false);
  const blocks = body.messages[0].content;
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].type, "text");
  assert.ok(blocks[1].text.includes("<env>"));
});

test("opencode-env: responses instructions carries the block; existing passes through", () => {
  const body = { instructions: "be terse" };
  ensureEnvFingerprint(body, true);
  assert.ok(body.instructions.startsWith("be terse"));
  assert.ok(body.instructions.includes("<env>"));

  const empty = {};
  ensureEnvFingerprint(empty, true);
  assert.equal(empty.instructions, ENV_FINGERPRINT_NOTE);

  const passthrough = { instructions: "keep <env> as is" };
  ensureEnvFingerprint(passthrough, true);
  assert.equal(passthrough.instructions, "keep <env> as is");
});

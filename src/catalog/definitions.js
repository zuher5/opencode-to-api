/**
 * Curated model definitions ported from pi-bansos (v0.7.1).
 *
 * Model sweep 2026-10-20 (upstream v0.7.0):
 * - OpenCode Zen dropped: muse-spark-1.3/1.2, space-bunny (410 "use
 *   minimax-m3.1-flash-free instead"), ll-alpha (410), step-5-preview and
 *   ling-3.0/3.1 (400 "Model is unavailable").
 *   Added: beam-free, minimax-m3.1-flash-free.
 * - KiloCode Gateway dropped: stealth/cat-jam + stealth/glyph-cluster (401
 *   PAID_MODEL_AUTH_REQUIRED — stealth lane went sign-in), poolside/laguna-xs
 *   (429 consistently), liquid/lfm-2.5 (504 consistently).
 *   Added: minimax/minimax-m3.1-flash:free, xingchen-agi/xing4.0-29b-a4b:free.
 * Catalog total: 32 -> 25 (11 OpenCode + 14 Kilo).
 */

export const OPENCODE_MODELS = [
  {
    id: "beam-free",
    name: "Beam Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "minimax-m3.1-flash-free",
    name: "MiniMax M3.1 Flash Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 524_288,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
  {
    id: "mimo-v2.6-flash-free",
    name: "MiMo V2.6 Flash Free",
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 32_000,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
  {
    id: "nemotron-3-ultra-free",
    name: "Nemotron 3 Ultra Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "nemotron-3.5-lightning-free",
    name: "Nemotron 3.5 Lightning Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 262_144,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "big-pickle",
    name: "Big Pickle",
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 32_000,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "longcat-2.5-preview-free",
    name: "LongCat 2.5 Preview",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "deepseek-v4.1-flash-free",
    name: "DeepSeek V4.1 Flash Free",
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 32_000,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
  {
    id: "glm-5.3-flash-free",
    name: "GLM 5.3 Flash Free",
    reasoning: true,
    contextWindow: 200_000,
    maxTokens: 32_000,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
  {
    id: "cat-jam-free",
    name: "Cat Jam Free",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "nemotron-3.5-super-vl-free",
    name: "Nemotron 3.5 Super VL Free",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
];

// KiloCode gateway free models (keyless — https://kilo.ai/docs/gateway).
// Sweep 2026-10-20: stealth/cat-jam and stealth/glyph-cluster now answer 401
// PAID_MODEL_AUTH_REQUIRED (stealth lane went sign-in). poolside/laguna-xs
// 429s consistently (shared pool) and liquid/lfm-2.5 504s consistently —
// dropped. Added minimax/minimax-m3.1-flash:free (chat 200, image+video in)
// and xingchen-agi/xing4.0-29b-a4b:free (chat 200 on retry — shared-pool
// 429s under load, treat flaky).
export const KILO_MODELS = [
  {
    id: "kilo-auto/free",
    name: "Kilo Auto Free",
    reasoning: false,
    contextWindow: 256_000,
    maxTokens: 10_000,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "minimax/minimax-m3.1-flash:free",
    name: "MiniMax M3.1 Flash Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 524_288,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
  {
    id: "xingchen-agi/xing4.0-29b-a4b:free",
    name: "Xing 4.0 29B A4B Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 235_929,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron 3 Super Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 235_929,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "dots-studio/dots-3-note-preview:free",
    name: "Dots3-Note Preview Free",
    reasoning: true,
    contextWindow: 512_000,
    maxTokens: 460_800,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
  {
    id: "cohere/north-mini-code:free",
    name: "North Mini Code Free",
    reasoning: false,
    contextWindow: 256_000,
    maxTokens: 64_000,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    name: "Nemotron 3 Nano Omni Free",
    reasoning: true,
    contextWindow: 256_000,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
  {
    id: "openrouter/free",
    name: "OpenRouter Free (auto)",
    reasoning: false,
    contextWindow: 200_000,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "Nemotron 3.5 Lightning Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "nvidia/nemotron-3.5-content-safety:free",
    name: "Nemotron 3.5 Content Safety Free",
    reasoning: true,
    contextWindow: 128_000,
    maxTokens: 8_192,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
  {
    id: "poolside/laguna-s-2.1:free",
    name: "Laguna S 2.1 Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 32_768,
    api: "openai-completions",
    input: ["text"],
    source: "kilo",
  },
  {
    id: "thinkingmachines/inkling-small:free",
    name: "Inkling Small Free",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 262_144,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
  {
    id: "nvidia/nemotron-3.5-super-vl:free",
    name: "Nemotron 3.5 Super VL Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    api: "openai-completions",
    input: ["text", "image"],
    source: "kilo",
  },
];

export const ALL_KNOWN_MODELS = [...OPENCODE_MODELS, ...KILO_MODELS];
export const KILO_MODEL_IDS = new Set(KILO_MODELS.map((m) => m.id));
export const OPENCODE_MODEL_IDS = new Set(OPENCODE_MODELS.map((m) => m.id));

// As of v0.7.1 the muse-spark (Responses-API) class was dropped upstream, so
// no curated model is pinned to the Responses endpoint. The set stays exported
// (empty) so routing code and tests keep a stable contract.
export const OPENCODE_RESPONSES_MODELS = new Set([]);

/**
 * Curated model definitions ported from pi-bansos (v0.8.1).
 *
 * Model sweep 2026-11-07 (upstream v0.8.1):
 * - OpenCode Zen:
 *   Added: iceman-free (262K/131K), inkling-2-small-free (1M/131K, vision).
 *   Dropped: pulse-alpha-free (removed from catalog, 400 Model is unavailable).
 *   Updated: beam-free 1M/131K, crouton-alpha-free 1M/270K (vision), flint-40b-free 262K/65K.
 *   Total OpenCode models: 11.
 * - KiloCode Gateway:
 *   8 survivors chat-verified 200.
 * Catalog total: 19 (11 OpenCode + 8 Kilo).
 */

export const OPENCODE_MODELS = [
  {
    id: "beam-free",
    name: "Beam Free",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "crouton-alpha-free",
    name: "Crouton Alpha Free",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 270_000,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
  {
    id: "iceman-free",
    name: "Iceman Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 131_072,
    api: "openai-completions",
    input: ["text"],
    source: "opencode",
  },
  {
    id: "inkling-2-small-free",
    name: "Inkling 2 Small Free",
    reasoning: true,
    contextWindow: 1_048_576,
    maxTokens: 131_072,
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
    id: "deepseek-v4.1-flash-free",
    name: "DeepSeek V4.1 Flash Free",
    reasoning: true,
    contextWindow: 320_000,
    maxTokens: 64_000,
    api: "openai-completions",
    input: ["text", "image"],
    source: "opencode",
  },
  {
    id: "flint-40b-free",
    name: "Flint 40B Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text"],
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
// Sweep 2026-11-06 (live catalog): the gateway shed most of its free list —
// dropped: recursive/flint-v1.0, xingchen-agi/xing4.0, nemotron-3-super,
// nemotron-3.5-content-safety, poolside/laguna-s. All 8 survivors chat-verified 200.
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
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "Nemotron 3 Ultra Free",
    reasoning: true,
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    api: "openai-completions",
    input: ["text"],
    thinkingFormat: "openrouter",
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
    thinkingFormat: "openrouter",
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
    thinkingFormat: "openrouter",
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
    thinkingFormat: "openrouter",
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
    thinkingFormat: "openrouter",
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

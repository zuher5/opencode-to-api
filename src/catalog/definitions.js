/**
 * Curated model definitions ported from pi-bansos (v0.7.2).
 *
 * Model sweep 2026-10-26 (upstream v0.7.2):
 * - OpenCode Zen:
 *   Dropped (absent from /zen/v1/models catalog): minimax-m3.1-flash-free,
 *   nemotron-3-ultra-free, longcat-2.5-preview-free, cat-jam-free.
 *   Added: flint-40b-free (catalog-listed).
 *   Updated: deepseek-v4.1-flash-free contextWindow 200K -> 320K, maxTokens 32K -> 64K.
 * - KiloCode Gateway:
 *   Dropped (404 upstream): minimax/minimax-m3.1-flash:free, thinkingmachines/inkling-small:free.
 *   Added: recursive/flint-v1.0:free (chat 200).
 * Catalog total: 25 -> 21 (8 OpenCode + 13 Kilo).
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
    contextWindow: 200_000,
    maxTokens: 32_768,
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
// Sweep 2026-10-26: minimax/minimax-m3.1-flash:free and thinkingmachines/inkling-small:free
// dropped (404); recursive/flint-v1.0:free added (chat 200).
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
    id: "recursive/flint-v1.0:free",
    name: "Recursive Flint v1.0 Free",
    reasoning: true,
    contextWindow: 262_144,
    maxTokens: 32_768,
    api: "openai-completions",
    input: ["text"],
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

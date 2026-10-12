import path from "node:path";
import { homedir } from "node:os";

const home = homedir();
const defaultDataDir = path.join(home, ".opencode-to-api");

export const config = {
  port: Number(process.env.PORT || process.env.BANSOS_PORT) || 18080,
  portMaxAttempts: 20,
  host: process.env.HOST || process.env.BANSOS_HOST || "127.0.0.1",
  dataDir: process.env.DATA_DIR || process.env.BANSOS_DATA_DIR || defaultDataDir,
  localApiKey: (process.env.LOCAL_API_KEY || process.env.BANSOS_API_KEY || "").trim(),
  debug: process.env.DEBUG === "1" || process.env.BANSOS_DEBUG === "1",
  upstreamOpenCode: process.env.UPSTREAM_OPENCODE || "https://opencode.ai/zen",
  kiloChatUrl: process.env.KILO_CHAT_URL || "https://api.kilo.ai/api/gateway/chat/completions",
  kiloModelsUrl: process.env.KILO_MODELS_URL || "https://api.kilo.ai/api/gateway/models",
  opencodeUaEnv: "BANSOS_OPENCODE_UA",
  opencodeUaFallback: "1.18.31",
  timeoutMs: Number(process.env.TIMEOUT_MS) || 300_000,
  relayMaxTokens: 131_072,
};

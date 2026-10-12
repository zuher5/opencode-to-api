#!/usr/bin/env node

import { config } from "./config.js";
import { log } from "./utils/logger.js";
import { initLocalAuth, getLocalApiKey } from "./auth/local-auth.js";
import { initCatalog } from "./catalog/discovery.js";
import { refreshOpenCodeUA } from "./adapters/opencode-zen.js";
import { startServer, stopServer } from "./server.js";

async function main() {
  console.log(`
┌────────────────────────────────────────────────────────┐
│             OpenCode-to-API Standalone Server          │
│       OpenAI-Compatible Local Proxy for Free Models    │
└────────────────────────────────────────────────────────┘
`);

  // 1. Initialize Authentication
  const localKey = initLocalAuth();

  // 2. Initialize Models Catalog
  const models = await initCatalog();

  // 3. Keep gate UA up to date in background
  refreshOpenCodeUA().catch(() => {});

  // 4. Start HTTP Server
  try {
    const { server, port, host } = await startServer();
    config.port = port;

    console.log(`🚀 Server successfully running!`);
    console.log(`  • Web Dashboard  : http://${host}:${port}/`);
    console.log(`  • Local Endpoint : http://${host}:${port}/v1`);
    console.log(`  • Health Check   : http://${host}:${port}/health`);
    console.log(`  • Local API Key  : ${localKey}`);
    console.log(`  • Active Models  : ${models.length} models available`);
    console.log(`\nExample Usage:`);
    console.log(`  curl http://${host}:${port}/v1/chat/completions \\`);
    console.log(`    -H "Authorization: Bearer ${localKey}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"model":"kilo-auto/free","messages":[{"role":"user","content":"Halo!"}]}'`);
    console.log(`\nPress Ctrl+C to stop.`);

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down cleanly...`);
      await stopServer(server);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    log("error", "Failed starting server", { error: err.message });
    process.exit(1);
  }
}

main();

import http from "node:http";
import { config } from "./config.js";
import { log } from "./utils/logger.js";
import { handleRequest } from "./router.js";

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err) {
      log("error", "Unhandled server request error", { error: err.message, stack: err.stack });
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Internal Server Error", type: "api_error" } }));
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

export function startServer(basePort = config.port) {
  const server = createServer();
  const maxAttempts = config.portMaxAttempts;
  let port = basePort;
  let attempt = 0;

  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === "EADDRINUSE" && attempt < maxAttempts) {
        attempt++;
        log("info", `Port ${port} in use, trying next port ${port + 1}`);
        port++;
        server.listen(port, config.host);
        return;
      }
      server.off("listening", onListening);
      server.off("error", onError);
      reject(err);
    };

    const onListening = () => {
      server.off("error", onError);
      server.on("error", (err) => {
        log("error", "Post-bind server error", { error: err.message });
      });
      const addr = server.address();
      const resolvedPort = typeof addr === "object" && addr?.port ? addr.port : port;
      resolve({ server, port: resolvedPort, host: config.host });
    };

    server.on("error", onError);
    server.once("listening", onListening);
    server.listen(port, config.host);
  });
}

export function stopServer(server) {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      resolve();
    });
    server.closeIdleConnections?.();
  });
}

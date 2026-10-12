import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { log } from "../utils/logger.js";
import { sendJsonError } from "../utils/errors.js";

export function pipeUpstreamStream(stream, res, req, status = 200) {
  const nodeStream = stream instanceof Readable ? stream : Readable.fromWeb(stream);

  if (!res.headersSent) {
    res.writeHead(status, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
      "access-control-allow-origin": "*",
    });
  }

  nodeStream.on("error", (err) => {
    log("error", "Upstream streaming error", { error: err.message });
    if (!res.headersSent) {
      sendJsonError(res, 502, "Upstream streaming error", "api_error");
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  nodeStream.pipe(res);

  const cleanup = () => {
    req.off("aborted", cleanup);
    req.off("close", cleanup);
    if (!nodeStream.destroyed) {
      nodeStream.destroy();
    }
  };

  req.on("aborted", cleanup);
  req.on("close", cleanup);
  nodeStream.on("end", () => {
    req.off("aborted", cleanup);
    req.off("close", cleanup);
  });
  nodeStream.on("close", () => {
    req.off("aborted", cleanup);
    req.off("close", cleanup);
  });
}

export async function aggregateStreamToResponse(webStream, modelName) {
  const reader = webStream.getReader();
  const decoder = new TextDecoder();

  let id = `chatcmpl-${randomBytes(12).toString("hex")}`;
  let content = "";
  let reasoning = "";
  let finishReason = "stop";
  let usage = null;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("data:")) continue;
      const dataStr = line.slice(5).trim();
      if (dataStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.id) id = parsed.id;
        const choice = parsed.choices?.[0];
        if (choice) {
          if (choice.finish_reason) finishReason = choice.finish_reason;
          if (choice.delta?.content) content += choice.delta.content;
          if (choice.delta?.reasoning_content) reasoning += choice.delta.reasoning_content;
          if (choice.delta?.reasoning) reasoning += choice.delta.reasoning;
          if (typeof choice.text === "string") content += choice.text;
        }
        if (parsed.usage) usage = parsed.usage;
      } catch {}
    }
  }

  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
      total_tokens: Math.max(1, Math.ceil(content.length / 4)),
    },
  };
}

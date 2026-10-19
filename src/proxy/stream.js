import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { randomBytes } from "node:crypto";
import { log } from "../utils/logger.js";
import { sendJsonError } from "../utils/errors.js";
import { restoreToolAliases } from "../adapters/opencode-zen.js";

export function pipeUpstreamStream(stream, res, req, status = 200, aliases = null) {
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

  if (aliases && Object.keys(aliases).length > 0) {
    const decoder = new StringDecoder("utf8");
    let carry = "";
    nodeStream.on("data", (chunk) => {
      const text = carry + decoder.write(chunk);
      const lines = text.split("\n");
      carry = lines.pop() ?? "";
      const out = lines
        .map((line) =>
          line.includes("_pi")
            ? line.replace(/([A-Za-z0-9_-]+)_pi\b/g, (_m, base) => aliases[`${base}_pi`] ?? `${base}_pi`)
            : line
        )
        .join("\n");
      // Preserve terminators even when the completed line is empty:
      // blank lines delimit SSE events, including across chunk boundaries.
      if (lines.length > 0 && !res.writableEnded) {
        res.write(out + "\n");
      }
    });
    nodeStream.on("end", () => {
      carry += decoder.end();
      const tail = carry.replace(/([A-Za-z0-9_-]+)_pi\b/g, (_m, base) => aliases[`${base}_pi`] ?? `${base}_pi`);
      if (tail && !res.writableEnded) {
        res.write(tail);
      }
      res.end();
    });
  } else {
    nodeStream.pipe(res);
  }
}

export async function aggregateStreamToResponse(webStream, modelName, aliases = null) {
  const reader = webStream.getReader();
  const decoder = new TextDecoder();

  let id = `chatcmpl-${randomBytes(12).toString("hex")}`;
  let content = "";
  let reasoning = "";
  let finishReason = "stop";
  let usage = null;
  let buffer = "";
  const toolCalls = [];

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
          if (Array.isArray(choice.delta?.tool_calls)) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? toolCalls.length;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || `call_${randomBytes(8).toString("hex")}`,
                  type: "function",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }
        if (parsed.usage) usage = parsed.usage;
      } catch {}
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    const rawLine = buffer.trim();
    if (rawLine && rawLine.startsWith("data:")) {
      const dataStr = rawLine.slice(5).trim();
      if (dataStr !== "[DONE]") {
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
  }

  if (aliases && Object.keys(aliases).length > 0) {
    content = restoreToolAliases(content, aliases);
    if (reasoning) reasoning = restoreToolAliases(reasoning, aliases);
    for (const tc of toolCalls) {
      if (tc?.function?.name) {
        tc.function.name = restoreToolAliases(tc.function.name, aliases);
      }
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
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: toolCalls.length > 0 && finishReason === "stop" ? "tool_calls" : finishReason,
      },
    ],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
      total_tokens: Math.max(1, Math.ceil(content.length / 4)),
    },
  };
}

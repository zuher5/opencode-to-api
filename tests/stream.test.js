import test from "node:test";
import assert from "node:assert/strict";
import { aggregateStreamToResponse } from "../src/proxy/stream.js";

test("Stream Aggregator - aggregates SSE chunks into standard OpenAI completion", async () => {
  const chunks = [
    'data: {"id":"chatcmpl-test","choices":[{"delta":{"role":"assistant","content":"Halo"},"index":0}]}\n\n',
    'data: {"id":"chatcmpl-test","choices":[{"delta":{"content":" dunia!"},"index":0}]}\n\n',
    'data: {"id":"chatcmpl-test","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":5,"completion_tokens":4,"total_tokens":9}}\n\n',
    "data: [DONE]\n\n",
  ];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  const aggregated = await aggregateStreamToResponse(stream, "kilo-auto/free");

  assert.equal(aggregated.object, "chat.completion");
  assert.equal(aggregated.model, "kilo-auto/free");
  assert.equal(aggregated.choices[0].message.role, "assistant");
  assert.equal(aggregated.choices[0].message.content, "Halo dunia!");
  assert.equal(aggregated.choices[0].finish_reason, "stop");
  assert.equal(aggregated.usage.total_tokens, 9);
});

test("Stream Aggregator - aggregates SSE chunks with tool calls and alias restoration", async () => {
  const chunks = [
    'data: {"id":"chatcmpl-tool","choices":[{"delta":{"role":"assistant","content":""},"index":0}]}\n\n',
    'data: {"id":"chatcmpl-tool","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash_pi","arguments":"{\\"command\\":"}}]},"index":0}]}\n\n',
    'data: {"id":"chatcmpl-tool","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"uptime\\"}"}}]},"index":0}]}\n\n',
    'data: {"id":"chatcmpl-tool","choices":[{"delta":{},"finish_reason":"tool_calls","index":0}]}\n\n',
    "data: [DONE]\n\n",
  ];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  const aliases = { bash_pi: "bash" };
  const aggregated = await aggregateStreamToResponse(stream, "nemotron-3-ultra-free", aliases);

  assert.equal(aggregated.object, "chat.completion");
  assert.equal(aggregated.choices[0].finish_reason, "tool_calls");
  const toolCall = aggregated.choices[0].message.tool_calls[0];
  assert.equal(toolCall.function.name, "bash");
  assert.equal(toolCall.function.arguments, '{"command":"uptime"}');
});

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

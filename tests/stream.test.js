import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { aggregateStreamToResponse, pipeUpstreamStream } from "../src/proxy/stream.js";

async function collectStreamOutput(chunks, aliases = null) {
  const output = [];
  const res = new Writable({
    write(chunk, _enc, cb) {
      output.push(Buffer.from(chunk));
      cb();
    },
  });
  res.writeHead = () => {};
  const done = new Promise((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
  });
  pipeUpstreamStream(Readable.from(chunks), res, new EventEmitter(), 200, aliases);
  await done;
  return Buffer.concat(output).toString("utf8");
}

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
  const aggregated = await aggregateStreamToResponse(stream, "beam-free", aliases);

  assert.equal(aggregated.object, "chat.completion");
  assert.equal(aggregated.choices[0].finish_reason, "tool_calls");
  const toolCall = aggregated.choices[0].message.tool_calls[0];
  assert.equal(toolCall.function.name, "bash");
  assert.equal(toolCall.function.arguments, '{"command":"uptime"}');
});

test("Stream Framing - preserve line endings, empty event separators, and split UTF-8", async () => {
  const fixtures = [
    'data: {"name":"bash_pi"}\n\ndata: {"x":2}\n\n',
    'data: {"name":"bash_pi"}\r\n\r\ndata: {"x":2}\r\n\r\n',
    'data: {"name":"bash_pi","text":"你好 café 🐦"}\n\n',
    'data: {"name":"bash_pi"}\n\ndata: {"text":"akhir"}',
    '\n\ndata: {"name":"bash_pi"}\n\n\n',
  ];

  const aliases = { bash_pi: "bash" };

  for (const [index, fixture] of fixtures.entries()) {
    const bytes = Buffer.from(fixture);
    const expected = fixture.replaceAll("bash_pi", "bash");

    // 1. Whole chunk
    assert.equal(
      await collectStreamOutput([bytes], aliases),
      expected,
      `fixture ${index} failed as whole chunk`
    );

    // 2. Every two-chunk byte split
    const twoChunkSplits = Array.from({ length: bytes.length + 1 }, (_, i) => [
      bytes.subarray(0, i),
      bytes.subarray(i),
    ]);
    for (const chunks of twoChunkSplits) {
      assert.equal(
        await collectStreamOutput(chunks, aliases),
        expected,
        `fixture ${index} failed at two-chunk split`
      );
    }

    // 3. One-byte chunks
    const oneByteChunks = Array.from(bytes, (b) => Buffer.from([b]));
    assert.equal(
      await collectStreamOutput(oneByteChunks, aliases),
      expected,
      `fixture ${index} failed in 1-byte chunks`
    );
  }

  // 4. No-alias UTF-8 passthrough in one-byte chunks
  const passthroughFixture = Buffer.from('data: {"text":"你好 🐦","name":"bash_pi"}\n\n');
  const oneBytePassthrough = Array.from(passthroughFixture, (b) => Buffer.from([b]));
  assert.equal(
    await collectStreamOutput(oneBytePassthrough, null),
    passthroughFixture.toString("utf8")
  );
});

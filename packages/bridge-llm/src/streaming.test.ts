import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicBridge } from './anthropic.js';
import { OpenAIBridge } from './openai.js';
import { OllamaBridge } from './ollama.js';
import type { TunnloEvent, StreamChunk } from '@tunnlo/core';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeEvent(overrides: Partial<TunnloEvent> = {}): TunnloEvent {
  return {
    event_id: 'evt-stream-1',
    source_id: 'test-source',
    timestamp: '2026-03-15T00:00:00.000Z',
    event_type: 'DATA',
    payload: { message: 'test event data' },
    ...overrides,
  };
}

const SYSTEM_PROMPT = 'You are a monitoring assistant.';

/** Helper: create a mock ReadableStream from chunks of text */
function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/** Collect all chunks from an async iterable */
async function collectChunks(iterable: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

// --- OllamaBridge streaming (NDJSON) ---

describe('OllamaBridge streaming', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams tokens from Ollama NDJSON response', async () => {
    const ndjsonChunks = [
      '{"message":{"content":"Hello"},"done":false}\n',
      '{"message":{"content":" world"},"done":false}\n',
      '{"message":{"content":"!"},"done":true,"prompt_eval_count":20,"eval_count":30}\n',
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: createMockStream(ndjsonChunks),
    });

    const bridge = new OllamaBridge({ model: 'llama3.1:8b' });
    const chunks = await collectChunks(bridge.stream(makeEvent(), SYSTEM_PROMPT));

    const textChunks = chunks.filter((c) => c.type === 'text');
    expect(textChunks).toHaveLength(3);
    expect(textChunks.map((c) => c.text).join('')).toBe('Hello world!');

    const usageChunk = chunks.find((c) => c.type === 'usage');
    expect(usageChunk?.tokens_used).toBe(50);

    const doneChunk = chunks.find((c) => c.type === 'done');
    expect(doneChunk).toBeDefined();

    // Verify stream: true was sent
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it('throws on API error during streaming', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const bridge = new OllamaBridge({ model: 'llama3.1:8b' });
    await expect(collectChunks(bridge.stream(makeEvent(), SYSTEM_PROMPT)))
      .rejects.toThrow('Ollama API error 500');
  });
});

// --- AnthropicBridge streaming (SSE) ---

describe('AnthropicBridge streaming', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams tokens from Anthropic SSE response', async () => {
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":100}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Security"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":" alert"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":25}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: createMockStream(sseChunks),
    });

    const bridge = new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514', api_key: 'sk-test' });
    const chunks = await collectChunks(bridge.stream(makeEvent(), SYSTEM_PROMPT));

    const textChunks = chunks.filter((c) => c.type === 'text');
    expect(textChunks).toHaveLength(2);
    expect(textChunks.map((c) => c.text).join('')).toBe('Security alert');

    const usageChunk = chunks.find((c) => c.type === 'usage');
    expect(usageChunk?.tokens_used).toBe(125); // 100 input + 25 output

    // Verify stream: true was sent
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it('throws on API error during streaming', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });

    const bridge = new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514', api_key: 'sk-test' });
    await expect(collectChunks(bridge.stream(makeEvent(), SYSTEM_PROMPT)))
      .rejects.toThrow('Anthropic API error 429');
  });
});

// --- OpenAIBridge streaming (SSE) ---

describe('OpenAIBridge streaming', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams tokens from OpenAI SSE response', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Port"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" scan"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" detected"}}]}\n\n',
      'data: {"choices":[],"usage":{"total_tokens":180}}\n\n',
      'data: [DONE]\n\n',
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: createMockStream(sseChunks),
    });

    const bridge = new OpenAIBridge({ model: 'gpt-4o', api_key: 'sk-test' });
    const chunks = await collectChunks(bridge.stream(makeEvent(), SYSTEM_PROMPT));

    const textChunks = chunks.filter((c) => c.type === 'text');
    expect(textChunks.map((c) => c.text).join('')).toBe('Port scan detected');

    const usageChunk = chunks.find((c) => c.type === 'usage');
    expect(usageChunk?.tokens_used).toBe(180);

    // Verify stream options were sent
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('throws on API error during streaming', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid key',
    });

    const bridge = new OpenAIBridge({ model: 'gpt-4o', api_key: 'bad-key' });
    await expect(collectChunks(bridge.stream(makeEvent(), SYSTEM_PROMPT)))
      .rejects.toThrow('OpenAI API error 401');
  });
});

// --- Pipeline streaming integration ---

describe('Pipeline streaming integration', () => {
  it('calls onStreamChunk when bridge supports streaming', async () => {
    // Dynamic import to avoid circular dependency issues
    const { Pipeline } = await import('@tunnlo/core');
    const { InMemoryBus, createEvent } = await import('@tunnlo/core');

    const receivedChunks: StreamChunk[] = [];
    const onStreamChunk = vi.fn((agentId: string, event: TunnloEvent, chunk: StreamChunk) => {
      receivedChunks.push(chunk);
    });

    const bus = new InMemoryBus();
    const bridge = {
      send: vi.fn().mockResolvedValue({ content: 'fallback', tokens_used: 10 }),
      async *stream(_event: TunnloEvent, _prompt: string): AsyncIterable<StreamChunk> {
        yield { type: 'text', text: 'Hello' };
        yield { type: 'text', text: ' streaming' };
        yield { type: 'usage', tokens_used: 42 };
        yield { type: 'done' };
      },
      close: vi.fn(),
    };

    const adapter = {
      async connect() {},
      async *read() {
        yield { data: 'test', received_at: new Date().toISOString() };
      },
      transform(raw: any) {
        return createEvent('test', 'DATA', { data: raw.data.toString() });
      },
      async disconnect() {},
      health() { return { status: 'connected' as const }; },
    };

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['test', adapter]]),
      filters: [{ name: 'pass', process: (e: TunnloEvent) => e }],
      agents: [{
        id: 'stream-agent',
        bridge,
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'test' },
      }],
      actionHandlers: [],
      onStreamChunk,
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 150));

    // onStreamChunk should have been called (not send)
    expect(onStreamChunk).toHaveBeenCalled();
    expect(bridge.send).not.toHaveBeenCalled();

    const textChunks = receivedChunks.filter((c) => c.type === 'text');
    expect(textChunks.map((c) => c.text).join('')).toBe('Hello streaming');

    const usage = receivedChunks.find((c) => c.type === 'usage');
    expect(usage?.tokens_used).toBe(42);

    await pipeline.stop();
  });

  it('falls back to send() when no onStreamChunk handler', async () => {
    const { Pipeline } = await import('@tunnlo/core');
    const { InMemoryBus, createEvent } = await import('@tunnlo/core');

    const bus = new InMemoryBus();
    const bridge = {
      send: vi.fn().mockResolvedValue({ content: 'non-stream', tokens_used: 10 }),
      async *stream(): AsyncIterable<StreamChunk> {
        yield { type: 'text', text: 'should not be used' };
        yield { type: 'done' };
      },
      close: vi.fn(),
    };

    const adapter = {
      async connect() {},
      async *read() {
        yield { data: 'test', received_at: new Date().toISOString() };
      },
      transform(raw: any) {
        return createEvent('test', 'DATA', { data: raw.data.toString() });
      },
      async disconnect() {},
      health() { return { status: 'connected' as const }; },
    };

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['test', adapter]]),
      filters: [{ name: 'pass', process: (e: TunnloEvent) => e }],
      agents: [{
        id: 'fallback-agent',
        bridge,
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'test' },
      }],
      actionHandlers: [],
      // No onStreamChunk — should use send()
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 150));

    expect(bridge.send).toHaveBeenCalled();
    await pipeline.stop();
  });
});

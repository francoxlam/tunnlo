import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicBridge } from './anthropic.js';
import { OpenAIBridge } from './openai.js';
import { BaseLLMBridge } from './base.js';
import type { TunnloEvent, AgentResponse } from '@tunnlo/core';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeEvent(overrides: Partial<TunnloEvent> = {}): TunnloEvent {
  return {
    event_id: 'evt-123',
    source_id: 'test-source',
    timestamp: '2026-03-08T00:00:00.000Z',
    event_type: 'DATA',
    payload: { message: 'test event data' },
    ...overrides,
  };
}

const SYSTEM_PROMPT = 'You are a monitoring assistant.';

// --- BaseLLMBridge (action parsing) ---

describe('BaseLLMBridge', () => {
  // Create a concrete subclass to test base class methods
  class TestBridge extends BaseLLMBridge {
    async send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse> {
      const content = `Response for ${event.event_id}`;
      return { content, tokens_used: 0, actions: this.parseActions(content) };
    }

    // Expose protected methods for testing
    testFormatEvent(event: TunnloEvent) {
      return this.formatEventForLLM(event);
    }

    testParseActions(content: string) {
      return this.parseActions(content);
    }
  }

  it('formats events as sanitized JSON', () => {
    const bridge = new TestBridge({ model: 'test' });
    const formatted = bridge.testFormatEvent(makeEvent({ raw: 'should-be-excluded' }));
    const parsed = JSON.parse(formatted);

    expect(parsed.event_id).toBe('evt-123');
    expect(parsed.payload).toEqual({ message: 'test event data' });
    expect(parsed.raw).toBeUndefined(); // raw should be stripped
  });

  it('parses actions from markdown code block', () => {
    const bridge = new TestBridge({ model: 'test' });
    const content = `Here is my analysis.

\`\`\`json:actions
[{"type":"webhook","config":{},"payload":{"alert":"high CPU"}}]
\`\`\``;

    const actions = bridge.testParseActions(content);
    expect(actions).toHaveLength(1);
    expect(actions![0].type).toBe('webhook');
    expect(actions![0].payload).toEqual({ alert: 'high CPU' });
  });

  it('parses multiple actions', () => {
    const bridge = new TestBridge({ model: 'test' });
    const content = `Taking two actions.

\`\`\`json:actions
[
  {"type":"webhook","config":{},"payload":{"msg":"first"}},
  {"type":"mcp-tool","config":{"tool":"notify"},"payload":{"user":"admin"}}
]
\`\`\``;

    const actions = bridge.testParseActions(content);
    expect(actions).toHaveLength(2);
    expect(actions![0].type).toBe('webhook');
    expect(actions![1].type).toBe('mcp-tool');
  });

  it('returns undefined when no action block present', () => {
    const bridge = new TestBridge({ model: 'test' });
    const actions = bridge.testParseActions('Just a normal response with no actions.');
    expect(actions).toBeUndefined();
  });

  it('returns undefined for malformed JSON in action block', () => {
    const bridge = new TestBridge({ model: 'test' });
    const content = `\`\`\`json:actions
{not valid json
\`\`\``;
    const actions = bridge.testParseActions(content);
    expect(actions).toBeUndefined();
  });
});

// --- AnthropicBridge ---

describe('AnthropicBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws without API key', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514' }))
      .toThrow('api_key is required');

    if (orig) process.env.ANTHROPIC_API_KEY = orig;
  });

  it('sends request to Anthropic Messages API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Analysis: all good.' }],
        usage: { input_tokens: 150, output_tokens: 50 },
      }),
    });

    const bridge = new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514', api_key: 'sk-test' });
    const result = await bridge.send(makeEvent(), SYSTEM_PROMPT);

    expect(result.content).toBe('Analysis: all good.');
    expect(result.tokens_used).toBe(200);
    expect(result.actions).toBeUndefined();

    // Verify request
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('sk-test');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-sonnet-4-5-20250514');
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
  });

  it('extracts actions from Anthropic response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: 'Alert detected.\n\n```json:actions\n[{"type":"webhook","config":{},"payload":{"alert":"critical"}}]\n```',
        }],
        usage: { input_tokens: 100, output_tokens: 80 },
      }),
    });

    const bridge = new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514', api_key: 'sk-test' });
    const result = await bridge.send(makeEvent(), SYSTEM_PROMPT);

    expect(result.actions).toHaveLength(1);
    expect(result.actions![0].type).toBe('webhook');
    expect(result.actions![0].payload).toEqual({ alert: 'critical' });
  });

  it('throws on API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    const bridge = new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514', api_key: 'sk-test' });

    await expect(bridge.send(makeEvent(), SYSTEM_PROMPT))
      .rejects.toThrow('Anthropic API error 429');
  });

  it('uses custom base_url', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const bridge = new AnthropicBridge({
      model: 'claude-sonnet-4-5-20250514',
      api_key: 'sk-test',
      base_url: 'https://custom-proxy.example.com',
    });
    await bridge.send(makeEvent(), SYSTEM_PROMPT);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://custom-proxy.example.com/v1/messages');
  });

  it('reads API key from environment variable', () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'env-key-123';

    const bridge = new AnthropicBridge({ model: 'claude-sonnet-4-5-20250514' });
    // Should not throw — successfully read from env
    expect(bridge).toBeInstanceOf(AnthropicBridge);

    process.env.ANTHROPIC_API_KEY = orig ?? '';
    if (!orig) delete process.env.ANTHROPIC_API_KEY;
  });
});

// --- OpenAIBridge ---

describe('OpenAIBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws without API key', () => {
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() => new OpenAIBridge({ model: 'gpt-4o' }))
      .toThrow('api_key is required');

    if (orig) process.env.OPENAI_API_KEY = orig;
  });

  it('sends request to OpenAI Chat Completions API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Looks normal.' } }],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      }),
    });

    const bridge = new OpenAIBridge({ model: 'gpt-4o', api_key: 'sk-openai-test' });
    const result = await bridge.send(makeEvent(), SYSTEM_PROMPT);

    expect(result.content).toBe('Looks normal.');
    expect(result.tokens_used).toBe(130);
    expect(result.actions).toBeUndefined();

    // Verify request
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.headers['Authorization']).toBe('Bearer sk-openai-test');

    const body = JSON.parse(opts.body);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1].role).toBe('user');
  });

  it('extracts actions from OpenAI response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Sending alert.\n\n```json:actions\n[{"type":"webhook","config":{},"payload":{"level":"warn"}}]\n```',
          },
        }],
        usage: { total_tokens: 200 },
      }),
    });

    const bridge = new OpenAIBridge({ model: 'gpt-4o', api_key: 'sk-test' });
    const result = await bridge.send(makeEvent(), SYSTEM_PROMPT);

    expect(result.actions).toHaveLength(1);
    expect(result.actions![0].payload).toEqual({ level: 'warn' });
  });

  it('throws on API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    });

    const bridge = new OpenAIBridge({ model: 'gpt-4o', api_key: 'bad-key' });

    await expect(bridge.send(makeEvent(), SYSTEM_PROMPT))
      .rejects.toThrow('OpenAI API error 401');
  });

  it('handles empty choices gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [],
        usage: { total_tokens: 50 },
      }),
    });

    const bridge = new OpenAIBridge({ model: 'gpt-4o', api_key: 'sk-test' });
    const result = await bridge.send(makeEvent(), SYSTEM_PROMPT);

    expect(result.content).toBe('');
    expect(result.tokens_used).toBe(50);
  });

  it('uses custom base_url', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { total_tokens: 10 },
      }),
    });

    const bridge = new OpenAIBridge({
      model: 'gpt-4o',
      api_key: 'sk-test',
      base_url: 'https://my-proxy.example.com',
    });
    await bridge.send(makeEvent(), SYSTEM_PROMPT);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.example.com/v1/chat/completions');
  });
});

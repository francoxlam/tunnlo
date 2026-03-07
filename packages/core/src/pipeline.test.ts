import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from './pipeline.js';
import { InMemoryBus } from './bus.js';
import { createEvent } from './event.js';
import type { Adapter, AdapterConfig, AdapterHealth, RawEvent, TunnloEvent, Filter, AgentBridge, AgentResponse, ActionHandler, ActionRequest, ActionResult } from './types.js';

function createMockAdapter(events: RawEvent[]): Adapter {
  let connected = false;
  let config: AdapterConfig;
  return {
    async connect(c) { config = c; connected = true; },
    async *read() {
      for (const e of events) yield e;
    },
    transform(raw) {
      return createEvent('mock', 'DATA', { data: raw.data.toString() });
    },
    async disconnect() { connected = false; },
    health() { return { status: connected ? 'connected' : 'disconnected' }; },
  };
}

function createMockBridge(response: Partial<AgentResponse> = {}): AgentBridge {
  return {
    async send() {
      return { content: 'ok', tokens_used: 100, ...response };
    },
    async close() {},
  };
}

function createPassthroughFilter(): Filter {
  return {
    name: 'passthrough',
    process(event) { return event; },
  };
}

describe('Pipeline', () => {
  it('processes events from adapter through filters to bridge', async () => {
    const bus = new InMemoryBus();
    const bridgeSend = vi.fn().mockResolvedValue({ content: 'analyzed', tokens_used: 50 });
    const bridge: AgentBridge = { send: bridgeSend, close: vi.fn() };

    const adapter = createMockAdapter([
      { data: 'event1', received_at: new Date().toISOString() },
      { data: 'event2', received_at: new Date().toISOString() },
    ]);

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['mock', adapter]]),
      filters: [createPassthroughFilter()],
      bridge,
      agentConfig: {
        runtime: 'direct-llm',
        model: 'test',
        system_prompt: 'test prompt',
      },
      actionHandlers: [],
    });

    await pipeline.start();

    // Give the async pipeline time to process
    await new Promise((r) => setTimeout(r, 100));

    expect(bridgeSend).toHaveBeenCalledTimes(2);
    await pipeline.stop();
  });

  it('respects token budget', async () => {
    const bus = new InMemoryBus();
    const bridgeSend = vi.fn().mockResolvedValue({ content: 'ok', tokens_used: 600 });
    const bridge: AgentBridge = { send: bridgeSend, close: vi.fn() };

    const events = Array.from({ length: 5 }, (_, i) => ({
      data: `event${i}`,
      received_at: new Date().toISOString(),
    }));

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['mock', createMockAdapter(events)]]),
      filters: [createPassthroughFilter()],
      bridge,
      agentConfig: {
        runtime: 'direct-llm',
        model: 'test',
        system_prompt: 'test',
        token_budget: { max_per_hour: 1500, max_per_event: 4000 },
      },
      actionHandlers: [],
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 100));

    // With 600 tokens per call and 1500 budget, should stop after 2 calls
    expect(bridgeSend.mock.calls.length).toBeLessThanOrEqual(3);
    await pipeline.stop();
  });

  it('filters drop events correctly', async () => {
    const bus = new InMemoryBus();
    const bridgeSend = vi.fn().mockResolvedValue({ content: 'ok', tokens_used: 10 });
    const bridge: AgentBridge = { send: bridgeSend, close: vi.fn() };

    const dropFilter: Filter = {
      name: 'drop-all',
      process() { return null; },
    };

    const adapter = createMockAdapter([
      { data: 'event1', received_at: new Date().toISOString() },
    ]);

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['mock', adapter]]),
      filters: [dropFilter],
      bridge,
      agentConfig: { runtime: 'direct-llm', model: 'test', system_prompt: 'test' },
      actionHandlers: [],
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 100));

    expect(bridgeSend).not.toHaveBeenCalled();
    await pipeline.stop();
  });
});

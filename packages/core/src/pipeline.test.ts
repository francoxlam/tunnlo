import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from './pipeline.js';
import type { AgentEntry } from './pipeline.js';
import { InMemoryBus } from './bus.js';
import { createEvent } from './event.js';
import type { Adapter, AdapterConfig, AdapterHealth, RawEvent, TunnloEvent, Filter, AgentBridge, AgentResponse, ActionHandler, ActionRequest, ActionResult } from './types.js';

function createMockAdapter(events: RawEvent[], sourceId = 'mock'): Adapter {
  let connected = false;
  let config: AdapterConfig;
  return {
    async connect(c) { config = c; connected = true; },
    async *read() {
      for (const e of events) yield e;
    },
    transform(raw) {
      return createEvent(sourceId, 'DATA', { data: raw.data.toString() });
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

  it('multi-agent fan-out sends events to all agents', async () => {
    const bus = new InMemoryBus();
    const sendA = vi.fn().mockResolvedValue({ content: 'a', tokens_used: 10 });
    const sendB = vi.fn().mockResolvedValue({ content: 'b', tokens_used: 10 });

    const agents: AgentEntry[] = [
      {
        id: 'agent-a',
        bridge: { send: sendA, close: vi.fn() },
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'prompt a' },
      },
      {
        id: 'agent-b',
        bridge: { send: sendB, close: vi.fn() },
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'prompt b' },
      },
    ];

    const adapter = createMockAdapter([
      { data: 'event1', received_at: new Date().toISOString() },
    ]);

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['mock', adapter]]),
      filters: [createPassthroughFilter()],
      agents,
      actionHandlers: [],
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 100));

    // Both agents should receive the event (fan-out)
    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);
    await pipeline.stop();
  });

  it('multi-agent routing sends events only to matching agents', async () => {
    const bus = new InMemoryBus();
    const sendNetwork = vi.fn().mockResolvedValue({ content: 'net', tokens_used: 10 });
    const sendLogs = vi.fn().mockResolvedValue({ content: 'log', tokens_used: 10 });

    const agents: AgentEntry[] = [
      {
        id: 'network-analyzer',
        bridge: { send: sendNetwork, close: vi.fn() },
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'network' },
        sources: ['tshark'],
      },
      {
        id: 'log-analyzer',
        bridge: { send: sendLogs, close: vi.fn() },
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'logs' },
        sources: ['app-logs'],
      },
    ];

    const tsharkAdapter = createMockAdapter(
      [{ data: 'packet1', received_at: new Date().toISOString() }],
      'tshark',
    );
    const logAdapter = createMockAdapter(
      [{ data: 'error line', received_at: new Date().toISOString() }],
      'app-logs',
    );

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['tshark', tsharkAdapter], ['app-logs', logAdapter]]),
      filters: [createPassthroughFilter()],
      agents,
      actionHandlers: [],
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 100));

    // Each agent should only receive events from its routed sources
    expect(sendNetwork).toHaveBeenCalledTimes(1);
    expect(sendLogs).toHaveBeenCalledTimes(1);

    // Verify the correct events went to the correct agents
    expect(sendNetwork.mock.calls[0][0].source_id).toBe('tshark');
    expect(sendLogs.mock.calls[0][0].source_id).toBe('app-logs');
    await pipeline.stop();
  });

  it('multi-agent mixed routing: routed + fan-out agents', async () => {
    const bus = new InMemoryBus();
    const sendRouted = vi.fn().mockResolvedValue({ content: 'routed', tokens_used: 10 });
    const sendFanout = vi.fn().mockResolvedValue({ content: 'fanout', tokens_used: 10 });

    const agents: AgentEntry[] = [
      {
        id: 'network-only',
        bridge: { send: sendRouted, close: vi.fn() },
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'network only' },
        sources: ['tshark'],
      },
      {
        id: 'catch-all',
        bridge: { send: sendFanout, close: vi.fn() },
        config: { runtime: 'direct-llm', model: 'test', system_prompt: 'all events' },
        // no sources = fan-out
      },
    ];

    const tsharkAdapter = createMockAdapter(
      [{ data: 'packet', received_at: new Date().toISOString() }],
      'tshark',
    );
    const logAdapter = createMockAdapter(
      [{ data: 'log line', received_at: new Date().toISOString() }],
      'app-logs',
    );

    const pipeline = new Pipeline({
      bus,
      adapters: new Map([['tshark', tsharkAdapter], ['app-logs', logAdapter]]),
      filters: [createPassthroughFilter()],
      agents,
      actionHandlers: [],
    });

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 100));

    // Routed agent gets only tshark events
    expect(sendRouted).toHaveBeenCalledTimes(1);
    expect(sendRouted.mock.calls[0][0].source_id).toBe('tshark');

    // Fan-out agent gets ALL events
    expect(sendFanout).toHaveBeenCalledTimes(2);
    await pipeline.stop();
  });
});

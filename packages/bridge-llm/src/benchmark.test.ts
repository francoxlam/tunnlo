import { describe, it, expect, vi } from 'vitest';
import { BenchmarkRunner, formatReport } from './benchmark.js';
import type { BridgeSpec } from './benchmark.js';
import type { AgentBridge, AgentResponse, TunnloEvent } from '@tunnlo/core';

function makeEvent(id: string): TunnloEvent {
  return {
    event_id: id,
    source_id: 'test',
    timestamp: new Date().toISOString(),
    event_type: 'DATA',
    payload: { message: `test event ${id}` },
  };
}

function makeMockBridge(opts: {
  latency?: number;
  tokens?: number;
  fail?: boolean;
}): AgentBridge {
  const { latency = 10, tokens = 50, fail = false } = opts;
  return {
    async send(_event: TunnloEvent, _prompt: string): Promise<AgentResponse> {
      await new Promise((r) => setTimeout(r, latency));
      if (fail) throw new Error('bridge error');
      return { content: 'response', tokens_used: tokens };
    },
    async close() {},
  };
}

describe('BenchmarkRunner', () => {
  it('should run a basic benchmark and return aggregated results', async () => {
    const runner = new BenchmarkRunner({
      iterations: 2,
      warmup: 0,
      system_prompt: 'test prompt',
    });

    const spec: BridgeSpec = { name: 'mock-bridge', bridge: makeMockBridge({ tokens: 100 }) };
    const events = [makeEvent('e1')];

    const result = await runner.runBridge(spec, events);

    expect(result.name).toBe('mock-bridge');
    expect(result.iterations).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.avg_latency_ms).toBeGreaterThan(0);
    expect(result.total_tokens).toBe(200); // 2 iterations × 100 tokens
    expect(result.avg_tokens_per_request).toBe(100);
    expect(result.tokens_per_second).toBeGreaterThan(0);
    expect(result.samples).toHaveLength(2);
  });

  it('should handle bridge errors gracefully', async () => {
    const runner = new BenchmarkRunner({
      iterations: 3,
      warmup: 0,
      system_prompt: 'test prompt',
    });

    const spec: BridgeSpec = { name: 'fail-bridge', bridge: makeMockBridge({ fail: true }) };
    const events = [makeEvent('e1')];

    const result = await runner.runBridge(spec, events);

    expect(result.errors).toBe(3);
    expect(result.total_tokens).toBe(0);
    expect(result.avg_latency_ms).toBe(0);
    expect(result.samples.every((s) => s.error)).toBe(true);
  });

  it('should run warmup iterations that are not counted', async () => {
    const sendSpy = vi.fn<() => Promise<AgentResponse>>().mockResolvedValue({
      content: 'ok',
      tokens_used: 10,
    });
    const bridge: AgentBridge = { send: sendSpy, close: async () => {} };

    const runner = new BenchmarkRunner({
      iterations: 2,
      warmup: 1,
      system_prompt: 'test',
    });

    const result = await runner.runBridge(
      { name: 'spy', bridge },
      [makeEvent('e1')],
    );

    // 1 warmup + 2 measured = 3 total calls
    expect(sendSpy).toHaveBeenCalledTimes(3);
    // But only 2 measured
    expect(result.iterations).toBe(2);
    expect(result.samples).toHaveLength(2);
  });

  it('should run multiple bridges and produce a report', async () => {
    const runner = new BenchmarkRunner({
      iterations: 2,
      warmup: 0,
      system_prompt: 'test',
    });

    const bridges: BridgeSpec[] = [
      { name: 'fast', bridge: makeMockBridge({ latency: 5, tokens: 50 }) },
      { name: 'slow', bridge: makeMockBridge({ latency: 20, tokens: 80 }) },
    ];

    const report = await runner.run(bridges, [makeEvent('e1')]);

    expect(report.results).toHaveLength(2);
    expect(report.config.iterations).toBe(2);
    expect(report.config.events_count).toBe(1);
    expect(report.timestamp).toBeTruthy();
  });

  it('should call onProgress callback', async () => {
    const runner = new BenchmarkRunner({
      iterations: 2,
      warmup: 0,
      system_prompt: 'test',
    });

    const progress: [number, number][] = [];
    await runner.runBridge(
      { name: 'test', bridge: makeMockBridge({}) },
      [makeEvent('e1'), makeEvent('e2')],
      (completed, total) => progress.push([completed, total]),
    );

    expect(progress).toEqual([
      [1, 4], [2, 4], [3, 4], [4, 4],
    ]);
  });

  it('should handle multiple events per iteration', async () => {
    const runner = new BenchmarkRunner({
      iterations: 2,
      warmup: 0,
      system_prompt: 'test',
    });

    const events = [makeEvent('e1'), makeEvent('e2'), makeEvent('e3')];
    const result = await runner.runBridge(
      { name: 'multi', bridge: makeMockBridge({ tokens: 10 }) },
      events,
    );

    // 3 events × 2 iterations = 6 samples
    expect(result.samples).toHaveLength(6);
    expect(result.total_tokens).toBe(60);
  });
});

describe('formatReport', () => {
  it('should produce a formatted table string', () => {
    const report = {
      timestamp: '2026-01-01T00:00:00Z',
      config: { iterations: 3, warmup: 1, events_count: 1 },
      results: [
        {
          name: 'ollama/llama3.1:8b',
          iterations: 3,
          errors: 0,
          avg_latency_ms: 1200,
          min_latency_ms: 1000,
          max_latency_ms: 1500,
          p50_latency_ms: 1200,
          p95_latency_ms: 1500,
          total_tokens: 300,
          avg_tokens_per_request: 100,
          tokens_per_second: 83.33,
          samples: [],
        },
        {
          name: 'openai/gpt-4o-mini',
          iterations: 3,
          errors: 0,
          avg_latency_ms: 800,
          min_latency_ms: 700,
          max_latency_ms: 900,
          p50_latency_ms: 800,
          p95_latency_ms: 900,
          total_tokens: 450,
          avg_tokens_per_request: 150,
          tokens_per_second: 187.5,
          samples: [],
        },
      ],
    };

    const output = formatReport(report);

    expect(output).toContain('Tunnlo Benchmark Results');
    expect(output).toContain('ollama/llama3.1:8b');
    expect(output).toContain('openai/gpt-4o-mini');
    expect(output).toContain('Fastest:');
    // Fastest should be openai (lower avg)
    expect(output).toContain('Fastest: openai/gpt-4o-mini');
  });

  it('should show error details and sort failed bridges last', () => {
    const report = {
      timestamp: '2026-01-01T00:00:00Z',
      config: { iterations: 3, warmup: 0, events_count: 1 },
      results: [
        {
          name: 'broken-bridge',
          iterations: 3,
          errors: 3,
          avg_latency_ms: 0,
          min_latency_ms: 0,
          max_latency_ms: 0,
          p50_latency_ms: 0,
          p95_latency_ms: 0,
          total_tokens: 0,
          avg_tokens_per_request: 0,
          tokens_per_second: 0,
          samples: [
            { latency_ms: 10, tokens_used: 0, content: '', error: 'API key missing' },
            { latency_ms: 10, tokens_used: 0, content: '', error: 'API key missing' },
            { latency_ms: 10, tokens_used: 0, content: '', error: 'API key missing' },
          ],
        },
        {
          name: 'working-bridge',
          iterations: 3,
          errors: 0,
          avg_latency_ms: 500,
          min_latency_ms: 400,
          max_latency_ms: 600,
          p50_latency_ms: 500,
          p95_latency_ms: 600,
          total_tokens: 300,
          avg_tokens_per_request: 100,
          tokens_per_second: 200,
          samples: [],
        },
      ],
    };

    const output = formatReport(report);

    // Error section present
    expect(output).toContain('Errors');
    expect(output).toContain('broken-bridge: 3/3 failed');
    expect(output).toContain('API key missing');

    // Working bridge should appear before broken in the table
    const workingIdx = output.indexOf('working-bridge');
    const brokenIdx = output.indexOf('broken-bridge');
    expect(workingIdx).toBeLessThan(brokenIdx);
  });
});

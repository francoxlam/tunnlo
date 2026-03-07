import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { StdinAdapter } from './stdin.js';

describe('StdinAdapter', () => {
  it('reads lines from an input stream', async () => {
    const input = new Readable({
      read() {
        this.push('line one\n');
        this.push('line two\n');
        this.push(null);
      },
    });

    const adapter = new StdinAdapter();
    await adapter.connect({
      id: 'test-stdin',
      adapter: 'native/stdin',
      config: { input_stream: input },
    });

    const events: string[] = [];
    for await (const raw of adapter.read()) {
      events.push(typeof raw.data === 'string' ? raw.data : raw.data.toString());
    }

    expect(events).toEqual(['line one', 'line two']);
  });

  it('transforms raw events into TunnloEvents', async () => {
    const input = new Readable({
      read() {
        this.push('{"message":"test"}\n');
        this.push(null);
      },
    });

    const adapter = new StdinAdapter();
    await adapter.connect({
      id: 'test-stdin',
      adapter: 'native/stdin',
      config: { input_stream: input },
    });

    for await (const raw of adapter.read()) {
      const event = adapter.transform(raw);
      expect(event.source_id).toBe('test-stdin');
      expect(event.event_type).toBe('DATA');
      expect(event.payload).toEqual({ message: 'test' });
    }
  });

  it('reports health status', () => {
    const adapter = new StdinAdapter();
    expect(adapter.health().status).toBe('disconnected');
  });
});

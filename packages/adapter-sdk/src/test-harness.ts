import type { Adapter, AdapterConfig, RawEvent, TunnloEvent } from '@tunnlo/core';

export interface TestResult {
  passed: boolean;
  tests: Array<{ name: string; passed: boolean; error?: string }>;
}

export class AdapterTestHarness {
  private adapter: Adapter;
  private config: AdapterConfig;

  constructor(adapter: Adapter, config: AdapterConfig) {
    this.adapter = adapter;
    this.config = config;
  }

  async runAll(): Promise<TestResult> {
    const tests: TestResult['tests'] = [];

    tests.push(await this.test('connect', async () => {
      await this.adapter.connect(this.config);
      const h = this.adapter.health();
      if (h.status !== 'connected') {
        throw new Error(`Expected status "connected", got "${h.status}"`);
      }
    }));

    tests.push(await this.test('health reports connected', async () => {
      const h = this.adapter.health();
      if (h.status !== 'connected') {
        throw new Error(`Expected "connected", got "${h.status}"`);
      }
    }));

    tests.push(await this.test('read returns AsyncIterable', async () => {
      const iterator = this.adapter.read();
      if (!iterator || typeof iterator[Symbol.asyncIterator] !== 'function') {
        throw new Error('read() must return an AsyncIterable');
      }
    }));

    tests.push(await this.test('transform produces TunnloEvent', async () => {
      const raw: RawEvent = {
        data: '{"test": true}',
        received_at: new Date().toISOString(),
      };
      const event = this.adapter.transform(raw);
      if (!event.event_id) throw new Error('Missing event_id');
      if (!event.source_id) throw new Error('Missing source_id');
      if (!event.timestamp) throw new Error('Missing timestamp');
      if (!event.event_type) throw new Error('Missing event_type');
      if (!event.payload) throw new Error('Missing payload');
    }));

    tests.push(await this.test('disconnect', async () => {
      await this.adapter.disconnect();
      const h = this.adapter.health();
      if (h.status !== 'disconnected') {
        throw new Error(`Expected "disconnected", got "${h.status}"`);
      }
    }));

    return {
      passed: tests.every((t) => t.passed),
      tests,
    };
  }

  private async test(name: string, fn: () => Promise<void>): Promise<TestResult['tests'][0]> {
    try {
      await fn();
      return { name, passed: true };
    } catch (err) {
      return { name, passed: false, error: String(err) };
    }
  }
}

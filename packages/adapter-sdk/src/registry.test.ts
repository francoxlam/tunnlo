import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from './registry.js';
import type { Adapter, AdapterConfig, AdapterHealth, RawEvent, TunnloEvent } from '@tunnlo/core';

class MockAdapter implements Adapter {
  async connect(_config: AdapterConfig): Promise<void> {}
  async *read(): AsyncIterable<RawEvent> {}
  transform(raw: RawEvent): TunnloEvent {
    return { event_id: '1', source_id: 'mock', timestamp: raw.received_at, event_type: 'DATA', payload: { data: String(raw.data) } };
  }
  async disconnect(): Promise<void> {}
  health(): AdapterHealth { return { status: 'connected' }; }
}

describe('AdapterRegistry', () => {
  it('registers and creates adapters', () => {
    const registry = new AdapterRegistry();
    registry.register({
      name: 'test-adapter',
      description: 'A test adapter',
      version: '1.0.0',
      tags: ['test'],
      factory: () => new MockAdapter(),
    });

    const adapter = registry.create('test-adapter', { adapter: 'test', id: 'test-1', config: {} });
    expect(adapter).toBeInstanceOf(MockAdapter);
  });

  it('throws on duplicate registration', () => {
    const registry = new AdapterRegistry();
    const entry = {
      name: 'dup',
      description: 'Dup',
      version: '1.0.0',
      factory: () => new MockAdapter(),
    };

    registry.register(entry);
    expect(() => registry.register(entry)).toThrow('already registered');
  });

  it('throws on unknown adapter', () => {
    const registry = new AdapterRegistry();
    expect(() => registry.create('nope', { adapter: 'nope', id: 'x', config: {} })).toThrow('not found');
  });

  it('lists registered adapters', () => {
    const registry = new AdapterRegistry();
    registry.register({
      name: 'a1',
      description: 'First',
      version: '1.0.0',
      tags: ['network'],
      factory: () => new MockAdapter(),
    });
    registry.register({
      name: 'a2',
      description: 'Second',
      version: '2.0.0',
      tags: ['log'],
      factory: () => new MockAdapter(),
    });

    expect(registry.list()).toHaveLength(2);
  });

  it('searches by name, description, and tags', () => {
    const registry = new AdapterRegistry();
    registry.register({
      name: 'network-sniffer',
      description: 'Captures network packets',
      version: '1.0.0',
      tags: ['network', 'pcap'],
      factory: () => new MockAdapter(),
    });
    registry.register({
      name: 'log-reader',
      description: 'Reads log files',
      version: '1.0.0',
      tags: ['logs', 'file'],
      factory: () => new MockAdapter(),
    });

    expect(registry.search('network')).toHaveLength(1);
    expect(registry.search('log')).toHaveLength(1);
    expect(registry.search('pcap')).toHaveLength(1);
  });

  it('unregisters adapters', () => {
    const registry = new AdapterRegistry();
    registry.register({
      name: 'temp',
      description: 'Temp',
      version: '1.0.0',
      factory: () => new MockAdapter(),
    });

    expect(registry.unregister('temp')).toBe(true);
    expect(registry.get('temp')).toBeUndefined();
  });

  it('serializes to JSON without factory', () => {
    const registry = new AdapterRegistry();
    registry.register({
      name: 'test',
      description: 'Test adapter',
      version: '1.0.0',
      author: 'tunnlo',
      factory: () => new MockAdapter(),
    });

    const json = registry.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe('test');
    expect((json[0] as any).factory).toBeUndefined();
  });
});

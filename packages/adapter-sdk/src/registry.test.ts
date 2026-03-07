import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from './registry.js';
import { StdinAdapter } from '@tunnlo/adapters';

describe('AdapterRegistry', () => {
  it('registers and creates adapters', () => {
    const registry = new AdapterRegistry();
    registry.register({
      name: 'test-adapter',
      description: 'A test adapter',
      version: '1.0.0',
      tags: ['test'],
      factory: () => new StdinAdapter(),
    });

    const adapter = registry.create('test-adapter', { adapter: 'test', id: 'test-1', config: {} });
    expect(adapter).toBeInstanceOf(StdinAdapter);
  });

  it('throws on duplicate registration', () => {
    const registry = new AdapterRegistry();
    const entry = {
      name: 'dup',
      description: 'Dup',
      version: '1.0.0',
      factory: () => new StdinAdapter(),
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
      factory: () => new StdinAdapter(),
    });
    registry.register({
      name: 'a2',
      description: 'Second',
      version: '2.0.0',
      tags: ['log'],
      factory: () => new StdinAdapter(),
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
      factory: () => new StdinAdapter(),
    });
    registry.register({
      name: 'log-reader',
      description: 'Reads log files',
      version: '1.0.0',
      tags: ['logs', 'file'],
      factory: () => new StdinAdapter(),
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
      factory: () => new StdinAdapter(),
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
      factory: () => new StdinAdapter(),
    });

    const json = registry.toJSON();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe('test');
    expect((json[0] as any).factory).toBeUndefined();
  });
});

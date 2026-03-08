import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KafkaAdapter } from './kafka.js';
import type { AdapterConfig } from '@tunnlo/core';

// Mock kafkajs via the dynamic import trick the adapter uses
const mockRun = vi.fn();
const mockSubscribe = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

const mockConsumer = {
  connect: mockConnect,
  subscribe: mockSubscribe,
  run: mockRun,
  disconnect: mockDisconnect,
};

const OriginalFunction = globalThis.Function;

vi.stubGlobal('Function', function MockFunction(this: any, ...args: any[]) {
  const body = args[args.length - 1];
  if (typeof body === 'string' && body.includes('import("kafkajs")')) {
    return () =>
      Promise.resolve({
        Kafka: class {
          consumer() {
            return mockConsumer;
          }
        },
      });
  }
  return new OriginalFunction(...args);
} as any);

function makeConfig(overrides: Record<string, any> = {}): AdapterConfig {
  return {
    id: 'test-kafka',
    adapter: 'kafka',
    config: {
      brokers: ['localhost:9092'],
      topic: 'test-topic',
      group_id: 'test-group',
      ...overrides,
    },
  };
}

describe('KafkaAdapter', () => {
  let adapter: KafkaAdapter;

  beforeEach(() => {
    adapter = new KafkaAdapter();
    vi.clearAllMocks();

    // Capture the eachMessage handler when run() is called
    mockRun.mockImplementation(async () => {});
  });

  it('reports health as disconnected before connect', () => {
    expect(adapter.health().status).toBe('disconnected');
  });

  it('connects and subscribes to a single topic', async () => {
    await adapter.connect(makeConfig());

    expect(mockConnect).toHaveBeenCalledOnce();
    expect(mockSubscribe).toHaveBeenCalledWith({
      topic: 'test-topic',
      fromBeginning: false,
    });
    expect(mockRun).toHaveBeenCalledOnce();
    expect(adapter.health().status).toBe('connected');
  });

  it('subscribes to multiple topics', async () => {
    await adapter.connect(makeConfig({ topic: ['orders', 'payments'] }));

    expect(mockSubscribe).toHaveBeenCalledTimes(2);
    expect(mockSubscribe).toHaveBeenCalledWith({ topic: 'orders', fromBeginning: false });
    expect(mockSubscribe).toHaveBeenCalledWith({ topic: 'payments', fromBeginning: false });
  });

  it('supports from_beginning option', async () => {
    await adapter.connect(makeConfig({ from_beginning: true }));

    expect(mockSubscribe).toHaveBeenCalledWith({
      topic: 'test-topic',
      fromBeginning: true,
    });
  });

  it('throws if brokers or topic are missing', async () => {
    await expect(
      adapter.connect({ id: 'x', adapter: 'kafka', config: { brokers: ['localhost:9092'] } }),
    ).rejects.toThrow('"brokers" and "topic"');

    const adapter2 = new KafkaAdapter();
    await expect(
      adapter2.connect({ id: 'x', adapter: 'kafka', config: { topic: 'foo' } }),
    ).rejects.toThrow('"brokers" and "topic"');
  });

  it('yields events pushed via eachMessage handler', async () => {
    let eachMessage: any;
    mockRun.mockImplementation(async (opts: any) => {
      eachMessage = opts.eachMessage;
    });

    await adapter.connect(makeConfig());

    // Simulate Kafka messages arriving
    const readIter = adapter.read()[Symbol.asyncIterator]();

    await eachMessage({
      topic: 'test-topic',
      partition: 0,
      message: {
        value: Buffer.from('{"order_id": 123}'),
        offset: '42',
        key: Buffer.from('key-1'),
        headers: { source: Buffer.from('checkout') },
        timestamp: '1700000000000',
      },
    });

    const result = await readIter.next();
    expect(result.done).toBe(false);
    expect(result.value.data).toBe('{"order_id": 123}');
    expect((result.value as any)._kafka.topic).toBe('test-topic');
    expect((result.value as any)._kafka.partition).toBe(0);
    expect((result.value as any)._kafka.offset).toBe('42');
    expect((result.value as any)._kafka.key).toBe('key-1');
  });

  it('transforms raw events with Kafka metadata', async () => {
    let eachMessage: any;
    mockRun.mockImplementation(async (opts: any) => {
      eachMessage = opts.eachMessage;
    });

    await adapter.connect(makeConfig());

    await eachMessage({
      topic: 'orders',
      partition: 2,
      message: {
        value: Buffer.from('{"status":"failed"}'),
        offset: '99',
        key: null,
        headers: {},
        timestamp: '1700000000000',
      },
    });

    const readIter = adapter.read()[Symbol.asyncIterator]();
    const { value: raw } = await readIter.next();
    const event = adapter.transform(raw);

    expect(event.source_id).toBe('test-kafka');
    expect(event.event_type).toBe('DATA');
    expect(event.payload).toEqual({ status: 'failed' });
    expect(event.metadata?.kafka.topic).toBe('orders');
    expect(event.metadata?.kafka.partition).toBe(2);
    expect(event.metadata?.kafka.offset).toBe('99');
  });

  it('disconnects cleanly', async () => {
    mockRun.mockImplementation(async () => {});
    await adapter.connect(makeConfig());
    await adapter.disconnect();

    expect(mockDisconnect).toHaveBeenCalledOnce();
    expect(adapter.health().status).toBe('disconnected');
  });
});

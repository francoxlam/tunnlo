import { describe, it, expect } from 'vitest';
import { createEvent } from './event.js';
import { FastBus } from './fast-bus.js';

describe('FastBus', () => {
  it('delivers events to subscribers', async () => {
    const bus = new FastBus({ batchSize: 1, flushIntervalMs: 1000 });
    const received: any[] = [];

    bus.subscribe('test', (event) => {
      received.push(event);
    });

    const event = createEvent('src', 'DATA', { msg: 'hello' });
    await bus.publish('test', event);

    // batchSize=1 triggers immediate flush
    expect(received.length).toBe(1);
    expect(received[0].payload.msg).toBe('hello');

    await bus.close();
  });

  it('batches events until batch size is reached', async () => {
    const bus = new FastBus({ batchSize: 3, flushIntervalMs: 60000 });
    const received: any[] = [];

    bus.subscribe('test', (event) => {
      received.push(event);
    });

    await bus.publish('test', createEvent('src', 'DATA', { n: 1 }));
    await bus.publish('test', createEvent('src', 'DATA', { n: 2 }));
    expect(received.length).toBe(0);

    await bus.publish('test', createEvent('src', 'DATA', { n: 3 }));
    expect(received.length).toBe(3);

    await bus.close();
  });

  it('drops events when queue is full', async () => {
    const bus = new FastBus({ batchSize: 100, flushIntervalMs: 60000, maxQueueSize: 2 });

    // No subscriber, so events queue up
    await bus.publish('test', createEvent('src', 'DATA', { n: 1 }));
    await bus.publish('test', createEvent('src', 'DATA', { n: 2 }));
    await bus.publish('test', createEvent('src', 'DATA', { n: 3 })); // should be dropped

    expect(bus.queueSize).toBe(2);

    await bus.close();
  });

  it('flushes remaining events on close', async () => {
    const bus = new FastBus({ batchSize: 100, flushIntervalMs: 60000 });
    const received: any[] = [];

    bus.subscribe('test', (event) => {
      received.push(event);
    });

    await bus.publish('test', createEvent('src', 'DATA', { n: 1 }));
    await bus.publish('test', createEvent('src', 'DATA', { n: 2 }));
    expect(received.length).toBe(0);

    await bus.close();
    expect(received.length).toBe(2);
  });

  it('unsubscribe stops delivery', async () => {
    const bus = new FastBus({ batchSize: 1, flushIntervalMs: 60000 });
    const received: any[] = [];

    const cb = (event: any) => { received.push(event); };
    bus.subscribe('test', cb);
    bus.unsubscribe('test', cb);

    await bus.publish('test', createEvent('src', 'DATA', { n: 1 }));
    expect(received.length).toBe(0);

    await bus.close();
  });
});

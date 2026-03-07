import { describe, it, expect, vi } from 'vitest';
import { InMemoryBus } from './bus.js';
import { createEvent } from './event.js';

describe('InMemoryBus', () => {
  it('delivers events to subscribers', async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];

    bus.subscribe('test', (event) => {
      received.push(event.event_id);
    });

    const event = createEvent('src', 'DATA', { msg: 'hi' });
    await bus.publish('test', event);

    expect(received).toEqual([event.event_id]);
    await bus.close();
  });

  it('only delivers to matching topic', async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];

    bus.subscribe('topicA', (event) => {
      received.push(event.event_id);
    });

    const event = createEvent('src', 'DATA', { msg: 'hi' });
    await bus.publish('topicB', event);

    expect(received).toEqual([]);
    await bus.close();
  });

  it('supports unsubscribe', async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];

    const cb = (event: any) => { received.push(event.event_id); };
    bus.subscribe('test', cb);
    bus.unsubscribe('test', cb);

    await bus.publish('test', createEvent('src', 'DATA', {}));
    expect(received).toEqual([]);
    await bus.close();
  });

  it('stops delivering after close', async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];

    bus.subscribe('test', (event) => {
      received.push(event.event_id);
    });

    await bus.close();
    await bus.publish('test', createEvent('src', 'DATA', {}));

    expect(received).toEqual([]);
  });
});

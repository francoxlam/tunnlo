import { describe, it, expect } from 'vitest';
import { createEvent, eventKey, getNestedValue } from './event.js';

describe('createEvent', () => {
  it('creates an event with required fields', () => {
    const event = createEvent('test-source', 'DATA', { message: 'hello' });

    expect(event.event_id).toBeDefined();
    expect(event.source_id).toBe('test-source');
    expect(event.event_type).toBe('DATA');
    expect(event.payload).toEqual({ message: 'hello' });
    expect(event.timestamp).toBeDefined();
    expect(event.priority).toBe(3);
  });

  it('accepts optional fields', () => {
    const event = createEvent('src', 'ALERT', { x: 1 }, {
      priority: 1,
      metadata: { tag: 'urgent' },
      raw: 'raw data',
    });

    expect(event.priority).toBe(1);
    expect(event.metadata).toEqual({ tag: 'urgent' });
    expect(event.raw).toBe('raw data');
  });
});

describe('getNestedValue', () => {
  it('resolves nested paths', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing paths', () => {
    expect(getNestedValue({}, 'a.b')).toBeUndefined();
  });
});

describe('eventKey', () => {
  it('generates a key from specified fields', () => {
    const event = createEvent('src', 'DATA', { src_ip: '10.0.0.1', dst_port: 443 });
    const key = eventKey(event, ['payload.src_ip', 'payload.dst_port']);
    expect(key).toBe('10.0.0.1|443');
  });
});

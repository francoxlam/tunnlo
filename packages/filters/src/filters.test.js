import { describe, it, expect } from 'vitest';
import { createEvent } from '@tunnlo/core';
import { RateLimiterFilter } from './rate-limiter.js';
import { ContentFilter } from './content-filter.js';
import { DedupFilter } from './dedup.js';
describe('RateLimiterFilter', () => {
    it('allows events within the limit', () => {
        const filter = new RateLimiterFilter({ max_events_per_minute: 5 });
        for (let i = 0; i < 5; i++) {
            const event = createEvent('src', 'DATA', { i });
            expect(filter.process(event)).not.toBeNull();
        }
    });
    it('drops events exceeding the limit', () => {
        const filter = new RateLimiterFilter({ max_events_per_minute: 2 });
        filter.process(createEvent('src', 'DATA', { i: 1 }));
        filter.process(createEvent('src', 'DATA', { i: 2 }));
        const dropped = filter.process(createEvent('src', 'DATA', { i: 3 }));
        expect(dropped).toBeNull();
    });
});
describe('ContentFilter', () => {
    it('passes events matching all rules (default mode)', () => {
        const filter = new ContentFilter({
            rules: [
                { field: 'payload.type', match: 'login' },
                { field: 'payload.status', match: 'failed' },
            ],
        });
        const event = createEvent('src', 'DATA', { type: 'login', status: 'failed' });
        expect(filter.process(event)).not.toBeNull();
    });
    it('drops events not matching all rules', () => {
        const filter = new ContentFilter({
            rules: [
                { field: 'payload.type', match: 'login' },
                { field: 'payload.status', match: 'failed' },
            ],
        });
        const event = createEvent('src', 'DATA', { type: 'login', status: 'success' });
        expect(filter.process(event)).toBeNull();
    });
    it('supports regex matching', () => {
        const filter = new ContentFilter({
            rules: [{ field: 'payload.ip', regex: '^192\\.168\\.' }],
        });
        const match = createEvent('src', 'DATA', { ip: '192.168.1.1' });
        const noMatch = createEvent('src', 'DATA', { ip: '10.0.0.1' });
        expect(filter.process(match)).not.toBeNull();
        expect(filter.process(noMatch)).toBeNull();
    });
    it('supports "in" matching', () => {
        const filter = new ContentFilter({
            rules: [{ field: 'payload.port', in: [22, 443, 3389] }],
        });
        const match = createEvent('src', 'DATA', { port: 22 });
        const noMatch = createEvent('src', 'DATA', { port: 80 });
        expect(filter.process(match)).not.toBeNull();
        expect(filter.process(noMatch)).toBeNull();
    });
    it('supports "any" mode', () => {
        const filter = new ContentFilter({
            rules: [
                { field: 'payload.type', match: 'login' },
                { field: 'payload.type', match: 'logout' },
            ],
            mode: 'any',
        });
        const event = createEvent('src', 'DATA', { type: 'login' });
        expect(filter.process(event)).not.toBeNull();
    });
});
describe('DedupFilter', () => {
    it('allows first occurrence', () => {
        const filter = new DedupFilter({ window_seconds: 10, key_fields: ['payload.msg'] });
        const event = createEvent('src', 'DATA', { msg: 'hello' });
        expect(filter.process(event)).not.toBeNull();
    });
    it('drops duplicate within window', () => {
        const filter = new DedupFilter({ window_seconds: 10, key_fields: ['payload.msg'] });
        const event1 = createEvent('src', 'DATA', { msg: 'hello' });
        const event2 = createEvent('src', 'DATA', { msg: 'hello' });
        filter.process(event1);
        expect(filter.process(event2)).toBeNull();
    });
    it('allows different events', () => {
        const filter = new DedupFilter({ window_seconds: 10, key_fields: ['payload.msg'] });
        const event1 = createEvent('src', 'DATA', { msg: 'hello' });
        const event2 = createEvent('src', 'DATA', { msg: 'world' });
        filter.process(event1);
        expect(filter.process(event2)).not.toBeNull();
    });
});
//# sourceMappingURL=filters.test.js.map
import { describe, it, expect } from 'vitest';
import { PushAdapter } from './push-adapter.js';
import { PollingAdapter } from './polling-adapter.js';
import { AdapterTestHarness } from './test-harness.js';
import { createAdapterTemplate } from './template.js';
class TestPushAdapter extends PushAdapter {
    async onConnect(_config) { }
    async onDisconnect() { }
    simulateEvent(data) {
        this.emit(data);
    }
}
class TestPollingAdapter extends PollingAdapter {
    pollData = [];
    offset = 0;
    setPollData(data) {
        this.pollData = data;
    }
    async onConnect(_config) { }
    async onDisconnect() { }
    async poll(_cursor) {
        const result = this.pollData;
        this.pollData = [];
        this.offset += result.length;
        return result;
    }
    getCursorOffset() {
        return this.offset;
    }
}
describe('PushAdapter', () => {
    it('emits and reads events', async () => {
        const adapter = new TestPushAdapter();
        await adapter.connect({ id: 'test', adapter: 'test', config: {} });
        const events = [];
        const readPromise = (async () => {
            for await (const event of adapter.read()) {
                events.push(event);
                if (events.length >= 2) {
                    await adapter.disconnect();
                    break;
                }
            }
        })();
        adapter.simulateEvent('event1');
        adapter.simulateEvent('event2');
        await readPromise;
        expect(events).toHaveLength(2);
        expect(events[0].data).toBe('event1');
    });
    it('transforms events correctly', async () => {
        const adapter = new TestPushAdapter();
        await adapter.connect({ id: 'push-test', adapter: 'test', config: {} });
        const event = adapter.transform({
            data: '{"hello":"world"}',
            received_at: new Date().toISOString(),
        });
        expect(event.source_id).toBe('push-test');
        expect(event.payload.hello).toBe('world');
    });
});
describe('PollingAdapter', () => {
    it('polls and yields events', async () => {
        const adapter = new TestPollingAdapter();
        await adapter.connect({ id: 'poll-test', adapter: 'test', config: { poll_interval_ms: 50 } });
        adapter.setPollData([
            { data: 'polled1', received_at: new Date().toISOString() },
        ]);
        const events = [];
        for await (const event of adapter.read()) {
            events.push(event);
            if (events.length >= 1) {
                await adapter.disconnect();
                break;
            }
        }
        expect(events).toHaveLength(1);
        expect(events[0].data).toBe('polled1');
    });
});
describe('AdapterTestHarness', () => {
    it('runs basic adapter tests', async () => {
        const adapter = new TestPushAdapter();
        const harness = new AdapterTestHarness(adapter, {
            id: 'harness-test',
            adapter: 'test',
            config: {},
        });
        const result = await harness.runAll();
        expect(result.tests.length).toBeGreaterThan(0);
        // connect, health, transform, disconnect should pass
        const passedTests = result.tests.filter(t => t.passed);
        expect(passedTests.length).toBeGreaterThanOrEqual(4);
    });
});
describe('createAdapterTemplate', () => {
    it('generates push adapter template', () => {
        const code = createAdapterTemplate('my-source', 'push');
        expect(code).toContain('class MySourceAdapter');
        expect(code).toContain('PushAdapter');
        expect(code).toContain('this.emit');
    });
    it('generates polling adapter template', () => {
        const code = createAdapterTemplate('data-fetcher', 'poll');
        expect(code).toContain('class DataFetcherAdapter');
        expect(code).toContain('PollingAdapter');
        expect(code).toContain('poll');
    });
});
//# sourceMappingURL=adapter-sdk.test.js.map
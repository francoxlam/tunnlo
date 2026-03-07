import { describe, it, expect } from 'vitest';
import { createEvent } from '@tunnlo/core';
import { MetricsCollector } from './metrics.js';
describe('MetricsCollector', () => {
    it('tracks received events', () => {
        const mc = new MetricsCollector();
        const event = createEvent('src', 'DATA', { msg: 'hi' });
        mc.recordEventReceived(event);
        const metrics = mc.getMetrics();
        expect(metrics.events_received).toBe(1);
        expect(metrics.adapters).toHaveLength(1);
        expect(metrics.adapters[0].id).toBe('src');
        expect(metrics.adapters[0].events_produced).toBe(1);
    });
    it('tracks filtered events', () => {
        const mc = new MetricsCollector();
        mc.recordEventFiltered('rate-limiter', true);
        mc.recordEventFiltered('rate-limiter', false);
        const metrics = mc.getMetrics();
        expect(metrics.filters).toHaveLength(1);
        expect(metrics.filters[0].events_in).toBe(2);
        expect(metrics.filters[0].events_out).toBe(1);
        expect(metrics.filters[0].drop_rate).toBe(0.5);
    });
    it('tracks tokens used', () => {
        const mc = new MetricsCollector();
        mc.recordTokensUsed(100);
        mc.recordTokensUsed(200);
        const metrics = mc.getMetrics();
        expect(metrics.tokens_used_total).toBe(300);
        expect(metrics.tokens_used_this_hour).toBe(300);
    });
    it('tracks LLM send latency', () => {
        const mc = new MetricsCollector();
        mc.recordEventSentToLlm('id1', 100);
        mc.recordEventSentToLlm('id2', 200);
        const metrics = mc.getMetrics();
        expect(metrics.events_sent_to_llm).toBe(2);
        expect(metrics.avg_latency_ms).toBe(150);
    });
    it('tracks errors', () => {
        const mc = new MetricsCollector();
        mc.recordError('adapter', 'connection failed');
        const metrics = mc.getMetrics();
        expect(metrics.errors).toHaveLength(1);
        expect(metrics.errors[0].source).toBe('adapter');
        expect(metrics.errors[0].message).toBe('connection failed');
    });
    it('tracks dropped events', () => {
        const mc = new MetricsCollector();
        mc.recordEventDropped();
        mc.recordEventDropped();
        expect(mc.getMetrics().events_dropped).toBe(2);
    });
    it('updates adapter status', () => {
        const mc = new MetricsCollector();
        const event = createEvent('my-adapter', 'DATA', {});
        mc.recordEventReceived(event);
        mc.updateAdapterStatus('my-adapter', 'error');
        const metrics = mc.getMetrics();
        expect(metrics.adapters[0].status).toBe('error');
    });
    it('reports uptime', () => {
        const mc = new MetricsCollector();
        const metrics = mc.getMetrics();
        expect(metrics.uptime_seconds).toBeGreaterThanOrEqual(0);
    });
});
//# sourceMappingURL=metrics.test.js.map
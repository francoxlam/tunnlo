import { describe, it, expect } from 'vitest';
import { createEvent } from '@tunnlo/core';
import { WindowedAggregationFilter } from './windowed-aggregation.js';
import { AdaptiveSamplingFilter } from './adaptive-sampling.js';
import { PriorityRouterFilter } from './priority-router.js';
describe('WindowedAggregationFilter', () => {
    it('buffers events until batch size is reached', () => {
        const filter = new WindowedAggregationFilter({
            window_seconds: 300,
            max_batch_size: 3,
        });
        const e1 = createEvent('src', 'DATA', { msg: 'a' });
        const e2 = createEvent('src', 'DATA', { msg: 'b' });
        const e3 = createEvent('src', 'DATA', { msg: 'c' });
        expect(filter.process(e1)).toBeNull();
        expect(filter.process(e2)).toBeNull();
        const batch = filter.process(e3);
        expect(batch).not.toBeNull();
        expect(batch.payload.batch_size).toBe(3);
        expect(batch.payload.events).toHaveLength(3);
    });
    it('includes all event data in the batch', () => {
        const filter = new WindowedAggregationFilter({
            window_seconds: 300,
            max_batch_size: 2,
            summary_prompt: 'Analyze these',
        });
        filter.process(createEvent('src', 'DATA', { x: 1 }));
        const batch = filter.process(createEvent('src', 'DATA', { x: 2 }));
        expect(batch.payload.window_prompt).toBe('Analyze these');
        expect(batch.source_id).toBe('tunnlo:aggregation');
        expect(batch.metadata?.aggregated).toBe(true);
    });
    it('flush returns null when buffer is empty', () => {
        const filter = new WindowedAggregationFilter({ window_seconds: 60 });
        expect(filter.flush()).toBeNull();
    });
    it('preserves highest priority in batch', () => {
        const filter = new WindowedAggregationFilter({
            window_seconds: 300,
            max_batch_size: 2,
        });
        filter.process(createEvent('src', 'ALERT', { x: 1 }, { priority: 1 }));
        const batch = filter.process(createEvent('src', 'DATA', { x: 2 }, { priority: 5 }));
        expect(batch.priority).toBe(1);
    });
});
describe('AdaptiveSamplingFilter', () => {
    it('always passes high-priority events', () => {
        const filter = new AdaptiveSamplingFilter({
            base_rate: 0.0, // would drop everything
            min_rate: 0.0,
            max_rate: 1.0,
            velocity_window_seconds: 60,
            high_velocity_threshold: 100,
            low_velocity_threshold: 10,
        });
        const event = createEvent('src', 'ALERT', { critical: true }, { priority: 1 });
        expect(filter.process(event)).not.toBeNull();
    });
    it('reports current sample rate', () => {
        const filter = new AdaptiveSamplingFilter({
            base_rate: 0.5,
            min_rate: 0.1,
            max_rate: 1.0,
            velocity_window_seconds: 60,
            high_velocity_threshold: 100,
            low_velocity_threshold: 10,
        });
        expect(filter.sampleRate).toBe(0.5);
    });
});
describe('PriorityRouterFilter', () => {
    it('always passes high-priority events', () => {
        const filter = new PriorityRouterFilter({
            high_priority_threshold: 2,
            low_priority_threshold: 5,
            drop_low_priority: true,
        });
        const event = createEvent('src', 'ALERT', {}, { priority: 1 });
        expect(filter.process(event)).not.toBeNull();
    });
    it('drops low-priority events when configured', () => {
        const filter = new PriorityRouterFilter({
            high_priority_threshold: 2,
            low_priority_threshold: 5,
            drop_low_priority: true,
        });
        const event = createEvent('src', 'DATA', {}, { priority: 5 });
        expect(filter.process(event)).toBeNull();
    });
    it('passes low-priority events when not configured to drop', () => {
        const filter = new PriorityRouterFilter({
            high_priority_threshold: 2,
            low_priority_threshold: 5,
            drop_low_priority: false,
        });
        const event = createEvent('src', 'DATA', {}, { priority: 5 });
        expect(filter.process(event)).not.toBeNull();
    });
    it('passes medium-priority events', () => {
        const filter = new PriorityRouterFilter({
            high_priority_threshold: 2,
            low_priority_threshold: 5,
            drop_low_priority: true,
        });
        const event = createEvent('src', 'DATA', {}, { priority: 3 });
        expect(filter.process(event)).not.toBeNull();
    });
});
//# sourceMappingURL=phase2-filters.test.js.map
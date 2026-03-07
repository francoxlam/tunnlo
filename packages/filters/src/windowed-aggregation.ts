import type { Filter, TunnloEvent } from '@tunnlo/core';
import { createEvent } from '@tunnlo/core';

export interface WindowedAggregationConfig {
  window_seconds: number;
  max_batch_size?: number;
  summary_prompt?: string;
}

export class WindowedAggregationFilter implements Filter {
  name = 'windowed-aggregation';
  private buffer: TunnloEvent[] = [];
  private windowMs: number;
  private maxBatchSize: number;
  private summaryPrompt: string;
  private windowStart: number = Date.now();

  constructor(config: WindowedAggregationConfig) {
    this.windowMs = config.window_seconds * 1000;
    this.maxBatchSize = config.max_batch_size ?? 50;
    this.summaryPrompt = config.summary_prompt ?? 'Analyze the following batch of events';
  }

  process(event: TunnloEvent): TunnloEvent | null {
    this.buffer.push(event);
    const now = Date.now();

    const windowExpired = now - this.windowStart >= this.windowMs;
    const batchFull = this.buffer.length >= this.maxBatchSize;

    if (windowExpired || batchFull) {
      return this.flush();
    }

    return null; // buffer, don't emit yet
  }

  flush(): TunnloEvent | null {
    if (this.buffer.length === 0) return null;

    const events = this.buffer;
    this.buffer = [];
    this.windowStart = Date.now();

    const summaries = events.map((e) => ({
      event_id: e.event_id,
      source_id: e.source_id,
      timestamp: e.timestamp,
      event_type: e.event_type,
      priority: e.priority,
      payload: e.payload,
    }));

    const highestPriority = Math.min(...events.map((e) => e.priority ?? 3));

    return createEvent('tunnlo:aggregation', 'DATA', {
      batch_size: events.length,
      window_prompt: this.summaryPrompt,
      events: summaries,
    }, {
      priority: highestPriority,
      metadata: {
        aggregated: true,
        event_count: events.length,
        source_ids: [...new Set(events.map((e) => e.source_id))],
      },
    });
  }

  get bufferSize(): number {
    return this.buffer.length;
  }
}

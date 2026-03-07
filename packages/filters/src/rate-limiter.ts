import type { Filter, TunnloEvent } from '@tunnlo/core';

export interface RateLimiterConfig {
  max_events_per_minute: number;
}

export class RateLimiterFilter implements Filter {
  name = 'rate-limiter';
  private timestamps: number[] = [];
  private maxPerMinute: number;

  constructor(config: RateLimiterConfig) {
    this.maxPerMinute = config.max_events_per_minute;
  }

  process(event: TunnloEvent): TunnloEvent | null {
    const now = Date.now();
    const windowStart = now - 60_000;

    // Prune old timestamps
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    if (this.timestamps.length >= this.maxPerMinute) {
      return null; // drop
    }

    this.timestamps.push(now);
    return event;
  }
}

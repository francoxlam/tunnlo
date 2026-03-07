import type { Filter, TunnloEvent } from '@tunnlo/core';
import { eventKey } from '@tunnlo/core';

export interface DedupFilterConfig {
  window_seconds: number;
  key_fields: string[];
  max_entries?: number;
}

export class DedupFilter implements Filter {
  name = 'dedup';
  private seen = new Map<string, number>();
  private windowMs: number;
  private keyFields: string[];
  private maxEntries: number;
  private pruneCounter = 0;

  constructor(config: DedupFilterConfig) {
    this.windowMs = config.window_seconds * 1000;
    this.keyFields = config.key_fields;
    this.maxEntries = config.max_entries ?? 50_000;
  }

  process(event: TunnloEvent): TunnloEvent | null {
    const key = eventKey(event, this.keyFields);
    const now = Date.now();

    // Prune expired entries every 1000 events or when map exceeds max
    this.pruneCounter++;
    if (this.pruneCounter >= 1000 || this.seen.size > this.maxEntries) {
      this.pruneCounter = 0;
      for (const [k, ts] of this.seen) {
        if (now - ts > this.windowMs) {
          this.seen.delete(k);
        }
      }
      // If still over max after pruning, drop oldest entries
      if (this.seen.size > this.maxEntries) {
        const excess = this.seen.size - this.maxEntries;
        const iter = this.seen.keys();
        for (let i = 0; i < excess; i++) {
          const next = iter.next();
          if (!next.done) this.seen.delete(next.value);
        }
      }
    }

    const lastSeen = this.seen.get(key);
    if (lastSeen !== undefined && now - lastSeen < this.windowMs) {
      return null; // duplicate within window
    }

    this.seen.set(key, now);
    return event;
  }
}

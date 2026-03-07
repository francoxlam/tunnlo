import type { Filter, TunnloEvent } from '@tunnlo/core';

export interface PriorityRouterConfig {
  high_priority_threshold: number;  // priority <= this bypasses throttle (default: 2)
  low_priority_threshold: number;   // priority >= this gets batched/dropped (default: 5)
  drop_low_priority: boolean;       // whether to drop low-priority events entirely
}

export class PriorityRouterFilter implements Filter {
  name = 'priority-router';
  private highThreshold: number;
  private lowThreshold: number;
  private dropLow: boolean;

  constructor(config: Partial<PriorityRouterConfig> = {}) {
    this.highThreshold = config.high_priority_threshold ?? 2;
    this.lowThreshold = config.low_priority_threshold ?? 5;
    this.dropLow = config.drop_low_priority ?? false;
  }

  process(event: TunnloEvent): TunnloEvent | null {
    const priority = event.priority ?? 3;

    // High priority: always pass through
    if (priority <= this.highThreshold) {
      return event;
    }

    // Low priority: drop if configured
    if (priority >= this.lowThreshold && this.dropLow) {
      return null;
    }

    // Medium priority: pass through normally
    return event;
  }
}

import type { Filter, TunnloEvent } from '@tunnlo/core';

export interface AdaptiveSamplingConfig {
  base_rate: number;          // base sample rate 0.0 - 1.0
  min_rate: number;           // minimum sample rate under high load
  max_rate: number;           // maximum sample rate under low load
  velocity_window_seconds: number;  // window to measure event velocity
  high_velocity_threshold: number;  // events/sec that triggers rate reduction
  low_velocity_threshold: number;   // events/sec that triggers rate increase
}

export class AdaptiveSamplingFilter implements Filter {
  name = 'adaptive-sampling';
  private timestamps: number[] = [];
  private currentRate: number;
  private minRate: number;
  private maxRate: number;
  private windowMs: number;
  private highThreshold: number;
  private lowThreshold: number;

  constructor(config: AdaptiveSamplingConfig) {
    this.currentRate = config.base_rate;
    this.minRate = config.min_rate;
    this.maxRate = config.max_rate;
    this.windowMs = config.velocity_window_seconds * 1000;
    this.highThreshold = config.high_velocity_threshold;
    this.lowThreshold = config.low_velocity_threshold;
  }

  process(event: TunnloEvent): TunnloEvent | null {
    const now = Date.now();

    // Track timestamps — prune expired entries from front (array is sorted)
    this.timestamps.push(now);
    const cutoff = now - this.windowMs;
    let pruneIdx = 0;
    while (pruneIdx < this.timestamps.length && this.timestamps[pruneIdx] < cutoff) {
      pruneIdx++;
    }
    if (pruneIdx > 0) {
      this.timestamps = this.timestamps.slice(pruneIdx);
    }

    // Calculate velocity (events per second)
    const windowSec = this.windowMs / 1000;
    const velocity = this.timestamps.length / windowSec;

    // Adjust rate based on velocity
    if (velocity > this.highThreshold) {
      this.currentRate = Math.max(this.minRate, this.currentRate * 0.8);
    } else if (velocity < this.lowThreshold) {
      this.currentRate = Math.min(this.maxRate, this.currentRate * 1.2);
    }

    // High-priority events always pass (priority 1 or 2)
    if (event.priority !== undefined && event.priority <= 2) {
      return event;
    }

    // Sample based on current rate
    return Math.random() < this.currentRate ? event : null;
  }

  get sampleRate(): number {
    return this.currentRate;
  }
}

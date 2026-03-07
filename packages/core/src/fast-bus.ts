import type { TunnloEvent } from './types.js';
import type { EventCallback, MessageBus } from './bus.js';
import { getLogger } from './logger.js';

export interface FastBusConfig {
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
}

export class FastBus implements MessageBus {
  private subscribers = new Map<string, Set<EventCallback>>();
  private queues = new Map<string, TunnloEvent[]>();
  private closed = false;
  private batchSize: number;
  private flushIntervalMs: number;
  private maxQueueSize: number;
  private flushTimers = new Map<string, ReturnType<typeof setInterval>>();
  private processing = new Set<string>();

  constructor(config: FastBusConfig = {}) {
    this.batchSize = config.batchSize ?? 100;
    this.flushIntervalMs = config.flushIntervalMs ?? 10;
    this.maxQueueSize = config.maxQueueSize ?? 50_000;
  }

  async publish(topic: string, event: TunnloEvent): Promise<void> {
    if (this.closed) return;

    let queue = this.queues.get(topic);
    if (!queue) {
      queue = [];
      this.queues.set(topic, queue);
    }

    // Drop events if queue is full (backpressure)
    if (queue.length >= this.maxQueueSize) {
      return;
    }

    queue.push(event);

    // Flush immediately if batch size reached
    if (queue.length >= this.batchSize) {
      await this.flush(topic);
    }
  }

  subscribe(topic: string, callback: EventCallback): void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(callback);

    // Start periodic flush for this topic
    if (!this.flushTimers.has(topic)) {
      const timer = setInterval(() => {
        this.flush(topic).catch((err) => {
          getLogger().error(`[tunnlo:fast-bus] flush error on "${topic}":`, err);
        });
      }, this.flushIntervalMs);
      this.flushTimers.set(topic, timer);
    }
  }

  unsubscribe(topic: string, callback: EventCallback): void {
    const subs = this.subscribers.get(topic);
    if (subs) {
      subs.delete(callback);
      // Clean up timer when last subscriber is removed
      if (subs.size === 0) {
        const timer = this.flushTimers.get(topic);
        if (timer) {
          clearInterval(timer);
          this.flushTimers.delete(topic);
        }
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;

    // Flush remaining events
    for (const topic of this.queues.keys()) {
      await this.flush(topic);
    }

    // Clear timers
    for (const timer of this.flushTimers.values()) {
      clearInterval(timer);
    }
    this.flushTimers.clear();
    this.subscribers.clear();
    this.queues.clear();
  }

  private async flush(topic: string): Promise<void> {
    if (this.processing.has(topic)) return;
    this.processing.add(topic);

    try {
      const queue = this.queues.get(topic);
      if (!queue || queue.length === 0) return;

      // Take the batch
      const batch = queue.splice(0, this.batchSize);
      const subs = this.subscribers.get(topic);
      if (!subs || subs.size === 0) return;

      // Deliver batch to subscribers
      for (const event of batch) {
        for (const cb of subs) {
          try {
            await cb(event);
          } catch (err) {
            getLogger().error(`[tunnlo:fast-bus] subscriber error:`, err);
          }
        }
      }
    } finally {
      this.processing.delete(topic);
    }
  }

  get queueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }
}

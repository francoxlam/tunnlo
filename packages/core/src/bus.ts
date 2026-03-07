import type { TunnloEvent } from './types.js';
import { getLogger } from './logger.js';

export type EventCallback = (event: TunnloEvent) => void | Promise<void>;

export interface MessageBus {
  publish(topic: string, event: TunnloEvent): Promise<void>;
  subscribe(topic: string, callback: EventCallback): void;
  unsubscribe(topic: string, callback: EventCallback): void;
  close(): Promise<void>;
}

export class InMemoryBus implements MessageBus {
  private subscribers = new Map<string, Set<EventCallback>>();
  private queue: Array<{ topic: string; event: TunnloEvent }> = [];
  private processing = false;
  private closed = false;

  async publish(topic: string, event: TunnloEvent): Promise<void> {
    if (this.closed) return;
    this.queue.push({ topic, event });
    if (!this.processing) {
      this.processing = true;
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        const subs = this.subscribers.get(item.topic);
        if (subs) {
          for (const cb of subs) {
            try {
              await cb(item.event);
            } catch (err) {
              getLogger().error(`[tunnlo:bus] subscriber error on topic "${item.topic}":`, err);
            }
          }
        }
      }
      this.processing = false;
    }
  }

  subscribe(topic: string, callback: EventCallback): void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(callback);
  }

  unsubscribe(topic: string, callback: EventCallback): void {
    this.subscribers.get(topic)?.delete(callback);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.subscribers.clear();
    this.queue.length = 0;
  }
}

import type { TunnloEvent } from './types.js';
import type { EventCallback, MessageBus } from './bus.js';
import { validateEvent } from './event.js';
import { getLogger } from './logger.js';

export interface RedisBusConfig {
  url?: string;
  maxLen?: number;
  consumerGroup?: string;
  consumerId?: string;
}

export class RedisStreamsBus implements MessageBus {
  private subscribers = new Map<string, Set<EventCallback>>();
  private pollingTopics = new Set<string>();
  private closed = false;
  private connected = false;
  private redis: any;
  private config: RedisBusConfig;

  constructor(config: RedisBusConfig = {}) {
    this.config = {
      url: config.url ?? 'redis://localhost:6379',
      maxLen: config.maxLen ?? 10_000,
      consumerGroup: config.consumerGroup ?? 'tunnlo',
      consumerId: config.consumerId ?? `tunnlo-${Date.now()}`,
    };
  }

  async connect(): Promise<void> {
    // Dynamic import to avoid requiring redis as a hard dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const redis = await (Function('return import("redis")')() as Promise<any>);
    this.redis = redis.createClient({ url: this.config.url });
    await this.redis.connect();
    this.connected = true;
  }

  private ensureConnected(): void {
    if (!this.connected || !this.redis) {
      throw new Error('[tunnlo:redis-bus] Not connected. Call connect() before using the bus.');
    }
  }

  async publish(topic: string, event: TunnloEvent): Promise<void> {
    if (this.closed) return;
    this.ensureConnected();

    const streamKey = `tunnlo:${topic}`;
    await this.redis.xAdd(
      streamKey,
      '*',
      { data: JSON.stringify(event) },
      { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: this.config.maxLen! } },
    );

    // Also deliver to local subscribers for hybrid usage
    const subs = this.subscribers.get(topic);
    if (subs) {
      for (const cb of subs) {
        try {
          await cb(event);
        } catch (err) {
          getLogger().error(`[tunnlo:redis-bus] subscriber error on topic "${topic}":`, err);
        }
      }
    }
  }

  subscribe(topic: string, callback: EventCallback): void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(callback);

    // Start polling this topic from Redis if not already doing so
    if (!this.pollingTopics.has(topic) && this.connected) {
      this.pollingTopics.add(topic);
      this.pollStream(topic).catch((err) => {
        getLogger().error(`[tunnlo:redis-bus] stream poll error for "${topic}":`, err);
      });
    }
  }

  unsubscribe(topic: string, callback: EventCallback): void {
    this.subscribers.get(topic)?.delete(callback);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.pollingTopics.clear();
    this.subscribers.clear();
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  private async pollStream(topic: string): Promise<void> {
    const streamKey = `tunnlo:${topic}`;
    const group = this.config.consumerGroup!;
    const consumer = this.config.consumerId!;
    const maxRetries = 10;
    let retries = 0;

    // Create consumer group if it doesn't exist
    try {
      await this.redis.xGroupCreate(streamKey, group, '0', { MKSTREAM: true });
    } catch {
      // Group may already exist
    }

    while (!this.closed && this.pollingTopics.has(topic)) {
      try {
        const results = await this.redis.xReadGroup(
          group,
          consumer,
          [{ key: streamKey, id: '>' }],
          { COUNT: 100, BLOCK: 2000 },
        );

        retries = 0; // Reset on success

        if (results) {
          for (const stream of results) {
            for (const message of stream.messages) {
              try {
                const parsed = JSON.parse(message.message.data);
                if (!validateEvent(parsed)) {
                  getLogger().error(`[tunnlo:redis-bus] invalid event structure, skipping`);
                  await this.redis.xAck(streamKey, group, message.id);
                  continue;
                }
                const event: TunnloEvent = parsed;
                // Events from Redis go directly to callbacks (not re-published to avoid loops)
                const subs = this.subscribers.get(topic);
                if (subs) {
                  for (const cb of subs) {
                    try {
                      await cb(event);
                    } catch (cbErr) {
                      getLogger().error(`[tunnlo:redis-bus] subscriber callback error:`, cbErr);
                    }
                  }
                }
                await this.redis.xAck(streamKey, group, message.id);
              } catch (err) {
                getLogger().error(`[tunnlo:redis-bus] message parse error:`, err);
              }
            }
          }
        }
      } catch (err) {
        if (!this.closed) {
          retries++;
          const backoffMs = Math.min(1000 * Math.pow(2, retries - 1), 30_000);
          getLogger().error(`[tunnlo:redis-bus] read error (retry ${retries}/${maxRetries}, backoff ${backoffMs}ms):`, err);
          if (retries >= maxRetries) {
            getLogger().error(`[tunnlo:redis-bus] max retries reached for topic "${topic}", stopping poll`);
            this.pollingTopics.delete(topic);
            return;
          }
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
  }
}

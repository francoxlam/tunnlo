import type { AdapterConfig, RawEvent } from '@tunnlo/core';
import { BaseAdapter } from './base.js';

export interface KafkaAdapterConfig {
  /** Kafka broker addresses, e.g. ['kafka-1:9092', 'kafka-2:9092'] */
  brokers: string[];
  /** Topic(s) to subscribe to. A single string or array of strings. */
  topic: string | string[];
  /** Consumer group ID (defaults to 'tunnlo-adapter') */
  group_id?: string;
  /** Kafka client ID (defaults to 'tunnlo') */
  client_id?: string;
  /** Start reading from the beginning of the topic (default: false) */
  from_beginning?: boolean;
  /** SASL authentication config */
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
  /** Enable TLS/SSL (default: false) */
  ssl?: boolean;
  /** Session timeout in ms (default: 30000) */
  session_timeout_ms?: number;
}

export class KafkaAdapter extends BaseAdapter {
  private consumer: any = null;
  private buffer: RawEvent[] = [];
  private waiting: ((value: IteratorResult<RawEvent>) => void) | null = null;
  private done = false;
  private maxRetries = 10;

  async connect(config: AdapterConfig): Promise<void> {
    await super.connect(config);

    const cfg = config.config as KafkaAdapterConfig;
    if (!cfg.brokers || !cfg.topic) {
      throw new Error('[tunnlo:kafka] "brokers" and "topic" are required in adapter config');
    }

    const kafkajs = await (Function('return import("kafkajs")')() as Promise<any>);
    const { Kafka } = kafkajs;

    const kafka = new Kafka({
      clientId: cfg.client_id ?? 'tunnlo',
      brokers: cfg.brokers,
      ...(cfg.ssl ? { ssl: true } : {}),
      ...(cfg.sasl ? { sasl: cfg.sasl } : {}),
      retry: { retries: 10 },
    });

    this.consumer = kafka.consumer({
      groupId: cfg.group_id ?? 'tunnlo-adapter',
      sessionTimeout: cfg.session_timeout_ms ?? 30_000,
      retry: { retries: 10 },
    });

    this.done = false;

    // Retry the full connect → subscribe → run sequence
    // Kafka may need time to elect a group coordinator after startup
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.consumer.connect();

        const topics = Array.isArray(cfg.topic) ? cfg.topic : [cfg.topic];
        for (const topic of topics) {
          await this.consumer.subscribe({
            topic,
            fromBeginning: cfg.from_beginning ?? false,
          });
        }

        await this.consumer.run({
          eachMessage: async ({ topic, partition, message }: any) => {
            const raw: RawEvent = {
              data: message.value?.toString() ?? '',
              received_at: new Date().toISOString(),
            };

            // Attach Kafka metadata so transform() can include it
            (raw as any)._kafka = {
              topic,
              partition,
              offset: message.offset,
              key: message.key?.toString(),
              headers: Object.fromEntries(
                Object.entries(message.headers ?? {}).map(([k, v]: [string, any]) => [k, v?.toString()]),
              ),
              timestamp: message.timestamp,
            };

            if (this.waiting) {
              const resolve = this.waiting;
              this.waiting = null;
              resolve({ value: raw, done: false });
            } else {
              this.buffer.push(raw);
            }
          },
        });

        // Success — break out of retry loop
        return;
      } catch (err: any) {
        if (attempt === this.maxRetries) {
          throw new Error(`[tunnlo:kafka] Failed to connect after ${this.maxRetries} attempts: ${err.message}`);
        }
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 10_000);
        console.error(`[tunnlo:kafka] Connect attempt ${attempt}/${this.maxRetries} failed: ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));

        // Disconnect before retrying to reset consumer state
        try { await this.consumer.disconnect(); } catch { /* best effort */ }
        this.consumer = kafka.consumer({
          groupId: cfg.group_id ?? 'tunnlo-adapter',
          sessionTimeout: cfg.session_timeout_ms ?? 30_000,
          retry: { retries: 10 },
        });
      }
    }
  }

  async *read(): AsyncIterable<RawEvent> {
    while (!this.done) {
      if (this.buffer.length > 0) {
        yield this.buffer.shift()!;
      } else {
        const result = await new Promise<IteratorResult<RawEvent>>((resolve) => {
          this.waiting = resolve;
        });
        if (result.done) return;
        yield result.value;
      }
    }
  }

  transform(raw: RawEvent) {
    const event = super.transform(raw);

    // Include Kafka metadata (topic, partition, offset, key) in event metadata
    const kafkaMeta = (raw as any)._kafka;
    if (kafkaMeta) {
      event.metadata = { ...event.metadata, kafka: kafkaMeta };
    }

    return event;
  }

  async disconnect(): Promise<void> {
    this.done = true;

    // Unblock any waiting reader
    if (this.waiting) {
      this.waiting({ value: undefined as any, done: true });
      this.waiting = null;
    }

    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }

    await super.disconnect();
  }

  health() {
    const h = super.health();
    if (this.consumer && this.status === 'connected') {
      h.message = 'Kafka consumer connected';
    }
    return h;
  }
}

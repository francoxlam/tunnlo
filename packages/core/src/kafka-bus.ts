import type { TunnloEvent } from './types.js';
import type { EventCallback, MessageBus } from './bus.js';
import { validateEvent } from './event.js';
import { getLogger } from './logger.js';

export interface KafkaBusConfig {
  brokers: string[];
  clientId?: string;
  groupId?: string;
  maxBatchSize?: number;
  lingerMs?: number;
}

export class KafkaBus implements MessageBus {
  private subscribers = new Map<string, Set<EventCallback>>();
  private closed = false;
  private connected = false;
  private kafka: any;
  private producer: any;
  private consumers = new Map<string, any>();
  private config: KafkaBusConfig;

  constructor(config: KafkaBusConfig) {
    this.config = {
      brokers: config.brokers,
      clientId: config.clientId ?? 'tunnlo',
      groupId: config.groupId ?? 'tunnlo-group',
      maxBatchSize: config.maxBatchSize ?? 1000,
      lingerMs: config.lingerMs ?? 5,
    };
  }

  async connect(): Promise<void> {
    const kafkajs = await (Function('return import("kafkajs")')() as Promise<any>);
    const { Kafka } = kafkajs;

    this.kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      maxInFlightRequests: 5,
      idempotent: true,
    });

    await this.producer.connect();
    this.connected = true;
  }

  private ensureConnected(): void {
    if (!this.connected || !this.kafka) {
      throw new Error('[tunnlo:kafka-bus] Not connected. Call connect() before using the bus.');
    }
  }

  async publish(topic: string, event: TunnloEvent): Promise<void> {
    if (this.closed) return;
    this.ensureConnected();

    const kafkaTopic = `tunnlo-${topic}`;

    if (this.producer) {
      await this.producer.send({
        topic: kafkaTopic,
        messages: [
          {
            key: event.source_id,
            value: JSON.stringify(event),
            headers: {
              event_type: event.event_type,
              priority: String(event.priority ?? 3),
            },
          },
        ],
      });
    }

    // Also deliver to local subscribers
    const subs = this.subscribers.get(topic);
    if (subs) {
      for (const cb of subs) {
        try {
          await cb(event);
        } catch (err) {
          getLogger().error(`[tunnlo:kafka-bus] subscriber error on topic "${topic}":`, err);
        }
      }
    }
  }

  subscribe(topic: string, callback: EventCallback): void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(callback);

    if (this.connected && !this.consumers.has(topic)) {
      this.consumeTopic(topic).catch((err) => {
        getLogger().error(`[tunnlo:kafka-bus] consumer error for "${topic}":`, err);
      });
    }
  }

  unsubscribe(topic: string, callback: EventCallback): void {
    this.subscribers.get(topic)?.delete(callback);
  }

  async close(): Promise<void> {
    this.closed = true;

    for (const [, consumer] of this.consumers) {
      try {
        await consumer.disconnect();
      } catch {
        // best effort
      }
    }
    this.consumers.clear();

    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    this.subscribers.clear();
  }

  private async consumeTopic(topic: string): Promise<void> {
    const kafkaTopic = `tunnlo-${topic}`;
    const consumer = this.kafka.consumer({
      groupId: `${this.config.groupId}-${topic}`,
    });

    await consumer.connect();
    await consumer.subscribe({ topic: kafkaTopic, fromBeginning: false });
    this.consumers.set(topic, consumer);

    await consumer.run({
      eachMessage: async ({ message }: any) => {
        if (this.closed) return;

        try {
          const parsed = JSON.parse(message.value.toString());
          if (!validateEvent(parsed)) {
            getLogger().error(`[tunnlo:kafka-bus] invalid event structure, skipping`);
            return;
          }
          const event: TunnloEvent = parsed;
          const subs = this.subscribers.get(topic);
          if (subs) {
            for (const cb of subs) {
              try {
                await cb(event);
              } catch (cbErr) {
                getLogger().error(`[tunnlo:kafka-bus] subscriber callback error:`, cbErr);
              }
            }
          }
        } catch (err) {
          getLogger().error(`[tunnlo:kafka-bus] message parse error:`, err);
        }
      },
    });
  }
}

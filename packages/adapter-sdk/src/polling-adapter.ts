import { randomUUID } from 'node:crypto';
import type { Adapter, AdapterConfig, AdapterHealth, AdapterStatus, RawEvent, TunnloEvent, CursorState, StateStore } from '@tunnlo/core';
import { createEvent, getLogger } from '@tunnlo/core';

export abstract class PollingAdapter implements Adapter {
  protected config!: AdapterConfig;
  protected status: AdapterStatus = 'disconnected';
  protected lastEventAt?: string;
  protected pollIntervalMs = 5000;
  private polling = false;
  private stateStore?: StateStore;
  private cursor?: CursorState;

  setStateStore(store: StateStore): void {
    this.stateStore = store;
  }

  async connect(config: AdapterConfig): Promise<void> {
    this.config = config;
    this.pollIntervalMs = config.config?.poll_interval_ms ?? 5000;
    this.polling = true;
    this.status = 'connected';

    if (this.stateStore) {
      this.cursor = (await this.stateStore.get(config.id)) ?? undefined;
    }

    await this.onConnect(config);
  }

  async *read(): AsyncIterable<RawEvent> {
    while (this.polling) {
      try {
        const events = await this.poll(this.cursor);
        for (const event of events) {
          this.lastEventAt = new Date().toISOString();
          yield event;
        }

        if (events.length > 0 && this.stateStore) {
          const newCursor: CursorState = {
            offset: this.getCursorOffset(),
            updated_at: new Date().toISOString(),
          };
          await this.stateStore.commit(this.config.id, newCursor);
          this.cursor = newCursor;
        }
      } catch (err) {
        this.status = 'degraded';
        getLogger().error(`[tunnlo:adapter:${this.config.id}] poll error:`, err);
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  transform(raw: RawEvent): TunnloEvent {
    let payload: Record<string, any>;
    try {
      payload = typeof raw.data === 'string' ? JSON.parse(raw.data) : { data: raw.data.toString('utf-8') };
    } catch {
      payload = { data: typeof raw.data === 'string' ? raw.data : raw.data.toString('utf-8') };
    }
    this.lastEventAt = new Date().toISOString();
    return createEvent(this.config.id, 'DATA', payload, { raw: raw.data });
  }

  async disconnect(): Promise<void> {
    this.polling = false;
    this.status = 'disconnected';
    await this.onDisconnect();
  }

  health(): AdapterHealth {
    return { status: this.status, last_event_at: this.lastEventAt };
  }

  protected abstract onConnect(config: AdapterConfig): Promise<void>;
  protected abstract onDisconnect(): Promise<void>;
  protected abstract poll(cursor?: CursorState): Promise<RawEvent[]>;
  protected abstract getCursorOffset(): string | number;
}

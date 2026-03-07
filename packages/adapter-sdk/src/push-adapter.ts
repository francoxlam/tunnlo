import type { Adapter, AdapterConfig, AdapterHealth, AdapterStatus, RawEvent, TunnloEvent } from '@tunnlo/core';
import { createEvent } from '@tunnlo/core';

export abstract class PushAdapter implements Adapter {
  protected config!: AdapterConfig;
  protected status: AdapterStatus = 'disconnected';
  protected lastEventAt?: string;
  private eventBuffer: RawEvent[] = [];
  private waiters: Array<(value: void) => void> = [];
  private connected = false;

  async connect(config: AdapterConfig): Promise<void> {
    this.config = config;
    this.connected = true;
    this.status = 'connected';
    await this.onConnect(config);
  }

  async *read(): AsyncIterable<RawEvent> {
    while (this.connected) {
      // Drain all buffered events first
      while (this.eventBuffer.length > 0) {
        const event = this.eventBuffer.shift()!;
        this.lastEventAt = new Date().toISOString();
        yield event;
      }
      // Only wait if still no events and still connected
      if (this.connected && this.eventBuffer.length === 0) {
        await new Promise<void>((resolve) => {
          this.waiters.push(resolve);
        });
      }
    }
  }

  protected emit(data: string | Buffer): void {
    this.eventBuffer.push({
      data,
      received_at: new Date().toISOString(),
    });
    // Wake all waiting readers
    const pending = this.waiters.splice(0);
    for (const resolve of pending) {
      resolve();
    }
  }

  transform(raw: RawEvent): TunnloEvent {
    let payload: Record<string, any>;
    try {
      payload = typeof raw.data === 'string' ? JSON.parse(raw.data) : { data: raw.data.toString('utf-8') };
    } catch {
      payload = { data: typeof raw.data === 'string' ? raw.data : raw.data.toString('utf-8') };
    }
    return createEvent(this.config.id, 'DATA', payload, { raw: raw.data });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    // Wake all waiting readers so they exit the loop
    const pending = this.waiters.splice(0);
    for (const resolve of pending) {
      resolve();
    }
    this.status = 'disconnected';
    await this.onDisconnect();
  }

  health(): AdapterHealth {
    return { status: this.status, last_event_at: this.lastEventAt };
  }

  protected abstract onConnect(config: AdapterConfig): Promise<void>;
  protected abstract onDisconnect(): Promise<void>;
}

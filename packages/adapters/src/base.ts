import type { Adapter, AdapterConfig, AdapterHealth, AdapterStatus, RawEvent, TunnloEvent } from '@tunnlo/core';
import { createEvent } from '@tunnlo/core';

export abstract class BaseAdapter implements Adapter {
  protected config!: AdapterConfig;
  protected status: AdapterStatus = 'disconnected';
  protected lastEventAt?: string;

  async connect(config: AdapterConfig): Promise<void> {
    this.config = config;
    this.status = 'connected';
  }

  abstract read(): AsyncIterable<RawEvent>;

  transform(raw: RawEvent): TunnloEvent {
    let payload: Record<string, any>;
    try {
      payload = typeof raw.data === 'string' ? JSON.parse(raw.data) : { data: raw.data.toString('utf-8') };
    } catch {
      payload = { data: typeof raw.data === 'string' ? raw.data : raw.data.toString('utf-8') };
    }
    this.lastEventAt = new Date().toISOString();
    return createEvent(this.config.id, 'DATA', payload, {
      raw: raw.data,
    });
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected';
  }

  health(): AdapterHealth {
    return {
      status: this.status,
      last_event_at: this.lastEventAt,
    };
  }
}

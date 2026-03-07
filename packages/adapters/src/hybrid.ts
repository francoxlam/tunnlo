import type { Adapter, AdapterConfig, AdapterHealth, RawEvent, TunnloEvent } from '@tunnlo/core';
import { createEvent } from '@tunnlo/core';

export interface HybridAdapterConfig {
  primary: { adapter: Adapter; config: AdapterConfig };
  secondary: { adapter: Adapter; config: AdapterConfig };
  trigger?: {
    field: string;
    match?: string;
    regex?: string;
  };
}

export class HybridAdapter implements Adapter {
  private primary: Adapter;
  private secondary: Adapter;
  private primaryConfig: AdapterConfig;
  private secondaryConfig: AdapterConfig;
  private trigger?: HybridAdapterConfig['trigger'];
  private compiledTriggerRegex?: RegExp;
  private config!: AdapterConfig;
  private connected = false;

  constructor(hybridConfig: HybridAdapterConfig) {
    this.primary = hybridConfig.primary.adapter;
    this.primaryConfig = hybridConfig.primary.config;
    this.secondary = hybridConfig.secondary.adapter;
    this.secondaryConfig = hybridConfig.secondary.config;
    this.trigger = hybridConfig.trigger;

    // Pre-compile trigger regex once to avoid ReDoS on every event
    if (this.trigger?.regex) {
      this.compiledTriggerRegex = new RegExp(this.trigger.regex);
    }
  }

  async connect(config: AdapterConfig): Promise<void> {
    this.config = config;
    await this.primary.connect(this.primaryConfig);
    await this.secondary.connect(this.secondaryConfig);
    this.connected = true;
  }

  async *read(): AsyncIterable<RawEvent> {
    for await (const raw of this.primary.read()) {
      yield raw;

      // Check if this event should trigger a secondary lookup
      if (this.trigger) {
        const event = this.primary.transform(raw);
        if (this.shouldTrigger(event)) {
          try {
            for await (const secondaryRaw of this.readSecondary(event)) {
              yield secondaryRaw;
            }
          } catch (err) {
            console.error(`[tunnlo:hybrid] secondary lookup error:`, err);
          }
        }
      }
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
    await this.primary.disconnect();
    await this.secondary.disconnect();
  }

  health(): AdapterHealth {
    const primaryHealth = this.primary.health();
    const secondaryHealth = this.secondary.health();

    if (primaryHealth.status === 'error') return primaryHealth;
    if (secondaryHealth.status === 'error') {
      return { status: 'degraded', message: 'Secondary adapter in error state' };
    }
    return primaryHealth;
  }

  private shouldTrigger(event: TunnloEvent): boolean {
    if (!this.trigger) return false;

    const value = this.getNestedValue(event, this.trigger.field);
    if (value === undefined) return false;

    const strValue = String(value);

    if (this.trigger.match) {
      return strValue.includes(this.trigger.match);
    }
    if (this.trigger.regex && this.compiledTriggerRegex) {
      return this.compiledTriggerRegex.test(strValue);
    }

    return Boolean(value);
  }

  private async *readSecondary(triggerEvent: TunnloEvent): AsyncIterable<RawEvent> {
    // If the secondary adapter has a triggerTool method (like McpBridgeAdapter), use it
    const sec = this.secondary as any;
    if (typeof sec.triggerTool === 'function') {
      sec.triggerTool(this.secondaryConfig.config.tool ?? 'lookup', triggerEvent.payload);

      // Read one result from the secondary
      for await (const raw of this.secondary.read()) {
        yield raw;
        break;
      }
    }
  }

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }
}

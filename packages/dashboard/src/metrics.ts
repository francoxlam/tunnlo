import type { TunnloEvent } from '@tunnlo/core';

export interface PipelineMetrics {
  uptime_seconds: number;
  events_received: number;
  events_filtered: number;
  events_sent_to_llm: number;
  events_dropped: number;
  events_buffered: number;
  tokens_used_total: number;
  tokens_used_this_hour: number;
  events_per_second: number;
  avg_latency_ms: number;
  active_llm_requests: number;
  adapters: AdapterMetrics[];
  filters: FilterMetrics[];
  recent_events: RecentEvent[];
  errors: ErrorEntry[];
  llm_responses: LlmResponseEntry[];
}

export interface AdapterMetrics {
  id: string;
  status: string;
  events_produced: number;
  last_event_at?: string;
}

export interface FilterMetrics {
  name: string;
  events_in: number;
  events_out: number;
  drop_rate: number;
}

export interface RecentEvent {
  event_id: string;
  source_id: string;
  timestamp: string;
  event_type: string;
  priority?: number;
  status: 'received' | 'filtered' | 'processing' | 'sent' | 'dropped';
}

export interface ErrorEntry {
  timestamp: string;
  source: string;
  message: string;
}

export interface LlmResponseEntry {
  timestamp: string;
  event_id: string;
  source_id: string;
  agent_id: string;
  content: string;
  tokens_used: number;
  latency_ms: number;
  has_actions: boolean;
}

export class MetricsCollector {
  private startTime = Date.now();
  private eventsReceived = 0;
  private eventsFiltered = 0;
  private eventsSentToLlm = 0;
  private eventsDropped = 0;
  private eventsBuffered = 0;
  private tokensTotal = 0;
  private tokensThisHour = 0;
  private hourStart = Date.now();
  private recentTimestamps: number[] = [];
  private latencies: number[] = [];
  private adapterMetrics = new Map<string, AdapterMetrics>();
  private filterMetrics = new Map<string, FilterMetrics>();
  private recentEvents: RecentEvent[] = [];
  private errors: ErrorEntry[] = [];
  private llmResponses: LlmResponseEntry[] = [];
  private activeLlmRequests = 0;
  private maxRecentEvents = 50;
  private maxErrors = 20;
  private maxLlmResponses = 30;

  recordEventReceived(event: TunnloEvent): void {
    this.eventsReceived++;
    this.recentTimestamps.push(Date.now());
    this.pruneTimestamps();

    const adapter = this.adapterMetrics.get(event.source_id) ?? {
      id: event.source_id,
      status: 'connected',
      events_produced: 0,
    };
    adapter.events_produced++;
    adapter.last_event_at = new Date().toISOString();
    this.adapterMetrics.set(event.source_id, adapter);

    this.addRecentEvent({
      event_id: event.event_id,
      source_id: event.source_id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      priority: event.priority,
      status: 'received',
    });
  }

  recordEventFiltered(filterName: string, passed: boolean): void {
    const filter = this.filterMetrics.get(filterName) ?? {
      name: filterName,
      events_in: 0,
      events_out: 0,
      drop_rate: 0,
    };
    filter.events_in++;
    if (passed) {
      filter.events_out++;
    }
    filter.drop_rate = filter.events_in > 0
      ? (filter.events_in - filter.events_out) / filter.events_in
      : 0;
    this.filterMetrics.set(filterName, filter);

    if (!passed) {
      this.eventsFiltered++;
    }
  }

  recordEventSentToLlm(eventId: string, latencyMs: number): void {
    this.eventsSentToLlm++;
    this.latencies.push(latencyMs);
    if (this.latencies.length > 1000) {
      this.latencies = this.latencies.slice(-1000);
    }
  }

  recordEventDropped(): void {
    this.eventsDropped++;
  }

  recordEventBuffered(): void {
    this.eventsBuffered++;
  }

  recordTokensUsed(tokens: number): void {
    this.tokensTotal += tokens;
    const now = Date.now();
    if (now - this.hourStart >= 3_600_000) {
      this.tokensThisHour = 0;
      this.hourStart = now;
    }
    this.tokensThisHour += tokens;
  }

  recordError(source: string, message: string): void {
    this.errors.push({
      timestamp: new Date().toISOString(),
      source,
      message,
    });
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  recordLlmResponse(entry: Omit<LlmResponseEntry, 'timestamp'>): void {
    this.llmResponses.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    if (this.llmResponses.length > this.maxLlmResponses) {
      this.llmResponses = this.llmResponses.slice(-this.maxLlmResponses);
    }
  }

  updateAdapterStatus(id: string, status: string): void {
    const adapter = this.adapterMetrics.get(id);
    if (adapter) {
      adapter.status = status;
    } else {
      this.adapterMetrics.set(id, {
        id,
        status,
        events_produced: 0,
      });
    }
  }

  updateEventStatus(eventId: string, status: RecentEvent['status']): void {
    const event = this.recentEvents.find((e) => e.event_id === eventId);
    if (event) {
      event.status = status;
    }
  }

  recordLlmRequestStart(): void {
    this.activeLlmRequests++;
  }

  recordLlmRequestEnd(): void {
    this.activeLlmRequests = Math.max(0, this.activeLlmRequests - 1);
  }

  getMetrics(): PipelineMetrics {
    const now = Date.now();
    this.pruneTimestamps();

    const windowSec = Math.min((now - this.startTime) / 1000, 60);
    const eps = windowSec > 0 ? this.recentTimestamps.length / windowSec : 0;

    const avgLatency = this.latencies.length > 0
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;

    return {
      uptime_seconds: Math.floor((now - this.startTime) / 1000),
      events_received: this.eventsReceived,
      events_filtered: this.eventsFiltered,
      events_sent_to_llm: this.eventsSentToLlm,
      events_dropped: this.eventsDropped,
      events_buffered: this.eventsBuffered,
      tokens_used_total: this.tokensTotal,
      tokens_used_this_hour: this.tokensThisHour,
      events_per_second: Math.round(eps * 100) / 100,
      avg_latency_ms: Math.round(avgLatency),
      active_llm_requests: this.activeLlmRequests,
      adapters: [...this.adapterMetrics.values()],
      filters: [...this.filterMetrics.values()],
      recent_events: this.recentEvents.slice(-this.maxRecentEvents),
      errors: this.errors.slice(-this.maxErrors),
      llm_responses: this.llmResponses.slice(-this.maxLlmResponses),
    };
  }

  private pruneTimestamps(): void {
    const cutoff = Date.now() - 60_000;
    this.recentTimestamps = this.recentTimestamps.filter((t) => t > cutoff);
  }

  private addRecentEvent(event: RecentEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecentEvents);
    }
  }
}

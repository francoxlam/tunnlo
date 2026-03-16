import type {
  Adapter,
  AdapterConfig,
  AgentBridge,
  AgentConfig,
  Filter,
  TunnloEvent,
  ActionHandler,
  BehaviorConfig,
  StreamChunk,
} from './types.js';
import type { MessageBus } from './bus.js';
import { createEvent } from './event.js';
import { getLogger } from './logger.js';

export interface MetricsPort {
  recordEventReceived(event: TunnloEvent): void;
  recordEventFiltered(filterName: string, passed: boolean): void;
  recordEventSentToLlm(eventId: string, latencyMs: number): void;
  recordEventDropped(): void;
  recordEventBuffered(): void;
  recordTokensUsed(tokens: number): void;
  recordError(source: string, message: string): void;
  updateAdapterStatus(id: string, status: string): void;
  updateEventStatus?(eventId: string, status: string): void;
  recordLlmRequestStart?(): void;
  recordLlmRequestEnd?(): void;
  recordLlmResponse?(entry: {
    event_id: string;
    source_id: string;
    agent_id: string;
    content: string;
    tokens_used: number;
    latency_ms: number;
    has_actions: boolean;
  }): void;
}

export interface AgentEntry {
  id: string;
  bridge: AgentBridge;
  config: AgentConfig;
  /** When set, only events from these source IDs are routed to this agent. */
  sources?: string[];
}

export type StreamChunkHandler = (agentId: string, event: TunnloEvent, chunk: StreamChunk) => void;

export interface PipelineOptions {
  bus: MessageBus;
  adapters: Map<string, Adapter>;
  filters: Filter[];
  /** @deprecated Use `agents` instead. Kept for backward compatibility. */
  bridge?: AgentBridge;
  /** @deprecated Use `agents` instead. Kept for backward compatibility. */
  agentConfig?: AgentConfig;
  /** Multiple agents with optional source-based routing. */
  agents?: AgentEntry[];
  actionHandlers: ActionHandler[];
  behavior?: BehaviorConfig;
  metrics?: MetricsPort;
  /** Called for each streaming chunk from LLM bridges that support streaming. */
  onStreamChunk?: StreamChunkHandler;
}

export class Pipeline {
  private bus: MessageBus;
  private adapters: Map<string, Adapter>;
  private filters: Filter[];
  private agents: AgentEntry[];
  private actionHandlers: Map<string, ActionHandler>;
  private behavior: BehaviorConfig;
  private running = false;
  private abortController: AbortController | null = null;
  private tokensPerAgent = new Map<string, number>();
  private hourStart = Date.now();
  private metrics?: MetricsPort;
  private onStreamChunk?: StreamChunkHandler;

  constructor(options: PipelineOptions) {
    this.bus = options.bus;
    this.adapters = options.adapters;
    this.filters = options.filters;

    // Normalize: support both legacy single-bridge and new multi-agent
    if (options.agents && options.agents.length > 0) {
      this.agents = options.agents;
    } else if (options.bridge && options.agentConfig) {
      this.agents = [{
        id: options.agentConfig.id ?? 'default',
        bridge: options.bridge,
        config: options.agentConfig,
        sources: options.agentConfig.sources,
      }];
    } else {
      throw new Error('Pipeline requires either `agents` or `bridge` + `agentConfig`');
    }

    this.actionHandlers = new Map(
      options.actionHandlers.map((h) => [h.type, h]),
    );
    this.behavior = options.behavior ?? { on_llm_unreachable: 'drop_and_alert' };
    this.metrics = options.metrics;
    this.onStreamChunk = options.onStreamChunk;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.abortController = new AbortController();

    this.bus.subscribe('filtered', async (event) => {
      await this.sendToAgent(event);
    });

    this.bus.subscribe('raw', async (event) => {
      this.metrics?.recordEventReceived(event);
      const { result, buffered } = this.applyFilters(event);
      if (result) {
        this.metrics?.updateEventStatus?.(result.event_id, 'filtered');
        getLogger().debug(`[tunnlo] Event ${result.event_id} passed filters, queuing for LLM`);
        await this.bus.publish('filtered', result);
      } else if (buffered) {
        getLogger().debug(`[tunnlo] Event ${event.event_id} buffered by filter`);
      } else {
        this.metrics?.updateEventStatus?.(event.event_id, 'dropped');
        this.metrics?.recordEventDropped();
      }
    });

    const adapterPromises: Promise<void>[] = [];
    for (const [id, adapter] of this.adapters) {
      this.metrics?.updateAdapterStatus(id, adapter.health().status);
      adapterPromises.push(this.runAdapter(id, adapter));
    }

    await Promise.allSettled(adapterPromises);

    // Flush any buffered events from windowed filters
    await this.flushFilters();
  }

  private async flushFilters(): Promise<void> {
    for (const filter of this.filters) {
      if (typeof filter.flush === 'function') {
        const flushed = filter.flush();
        if (flushed) {
          await this.bus.publish('filtered', flushed);
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.abortController?.abort();

    for (const [id, adapter] of this.adapters) {
      try {
        await adapter.disconnect();
        this.metrics?.updateAdapterStatus(id, 'disconnected');
      } catch (err) {
        getLogger().error('[tunnlo:pipeline] adapter disconnect error:', err);
        this.metrics?.recordError('pipeline', `adapter "${id}" disconnect error: ${err}`);
      }
    }

    for (const agent of this.agents) {
      try {
        await agent.bridge.close();
      } catch (err) {
        getLogger().error(`[tunnlo:pipeline] bridge "${agent.id}" close error:`, err);
      }
    }
    try {
      await this.bus.close();
    } catch (err) {
      getLogger().error('[tunnlo:pipeline] bus close error:', err);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private async runAdapter(id: string, adapter: Adapter): Promise<void> {
    try {
      for await (const raw of adapter.read()) {
        if (!this.running) break;
        try {
          const event = adapter.transform(raw);
          await this.bus.publish('raw', event);
        } catch (err) {
          getLogger().error(`[tunnlo:pipeline] transform error from "${id}":`, err);
          this.metrics?.recordError(id, `transform error: ${err}`);
        }
      }
    } catch (err) {
      if (this.running) {
        getLogger().error(`[tunnlo:pipeline] adapter "${id}" read error:`, err);
        this.metrics?.recordError(id, `read error: ${err}`);
        this.metrics?.updateAdapterStatus(id, 'error');
      }
    }
  }

  private applyFilters(event: TunnloEvent): { result: TunnloEvent | null; buffered: boolean } {
    let current: TunnloEvent | null = event;
    let buffered = false;
    for (const filter of this.filters) {
      if (!current) return { result: null, buffered };
      const result = filter.process(current);
      const isBuffering = result === null && typeof filter.flush === 'function';
      if (isBuffering) {
        buffered = true;
      }
      this.metrics?.recordEventFiltered(filter.name, result !== null || isBuffering);
      current = result;
    }
    return { result: current, buffered };
  }

  private resetHourlyBudgetIfNeeded(): void {
    const now = Date.now();
    if (now - this.hourStart >= 3_600_000) {
      this.tokensPerAgent.clear();
      this.hourStart = now;
    }
  }

  private async sendToAgent(event: TunnloEvent): Promise<void> {
    this.resetHourlyBudgetIfNeeded();

    // Find agents that should receive this event
    const targets = this.agents.filter((agent) => {
      if (!agent.sources || agent.sources.length === 0) return true; // fan-out
      return agent.sources.includes(event.source_id); // routed
    });

    if (targets.length === 0) {
      getLogger().debug(`[tunnlo] Event ${event.event_id} (${event.source_id}) has no matching agents, dropping`);
      this.metrics?.recordEventDropped();
      return;
    }

    // Send to all matching agents in parallel
    await Promise.allSettled(
      targets.map((agent) => this.sendToSingleAgent(agent, event)),
    );
  }

  private async sendToSingleAgent(agent: AgentEntry, event: TunnloEvent): Promise<void> {
    const budget = agent.config.token_budget;
    const agentTokens = this.tokensPerAgent.get(agent.id) ?? 0;
    if (budget && agentTokens >= budget.max_per_hour) {
      getLogger().warn(`[tunnlo:pipeline] agent "${agent.id}" hourly token budget exceeded, dropping event`);
      this.metrics?.recordEventDropped();
      return;
    }

    const startTime = Date.now();
    this.metrics?.updateEventStatus?.(event.event_id, 'processing');
    this.metrics?.recordLlmRequestStart?.();
    getLogger().info(`[tunnlo] Event ${event.event_id} (${event.source_id}) -> sending to agent "${agent.id}"...`);

    try {
      let response: import('./types.js').AgentResponse;

      if (agent.bridge.stream && this.onStreamChunk) {
        response = await this.consumeStream(agent, event);
      } else {
        response = await agent.bridge.send(event, agent.config.system_prompt);
      }

      const latencyMs = Date.now() - startTime;
      this.metrics?.recordLlmRequestEnd?.();

      this.tokensPerAgent.set(agent.id, agentTokens + response.tokens_used);
      this.metrics?.recordEventSentToLlm(event.event_id, latencyMs);
      this.metrics?.updateEventStatus?.(event.event_id, 'sent');
      this.metrics?.recordTokensUsed(response.tokens_used);
      this.metrics?.recordLlmResponse?.({
        event_id: event.event_id,
        source_id: event.source_id,
        agent_id: agent.id,
        content: response.content,
        tokens_used: response.tokens_used,
        latency_ms: latencyMs,
        has_actions: Array.isArray(response.actions) && response.actions.length > 0,
      });

      getLogger().info(`[tunnlo] Event ${event.event_id} (${event.source_id}) <- agent "${agent.id}" responded [${latencyMs}ms, ${response.tokens_used} tokens]`);
      if (!this.onStreamChunk) {
        getLogger().info(`[tunnlo] Response:\n${response.content}\n`);
      }

      if (response.actions) {
        for (const actionReq of response.actions) {
          const handler = this.actionHandlers.get(actionReq.type);
          if (handler) {
            try {
              await handler.execute(actionReq);
            } catch (err) {
              getLogger().error(`[tunnlo:pipeline] action "${actionReq.type}" error:`, err);
              this.metrics?.recordError('action', `${actionReq.type} error: ${err}`);
            }
          } else {
            getLogger().warn(`[tunnlo:pipeline] no handler for action type "${actionReq.type}"`);
          }
        }
      }
    } catch (err) {
      this.metrics?.recordLlmRequestEnd?.();
      this.metrics?.updateEventStatus?.(event.event_id, 'dropped');
      getLogger().error(`[tunnlo:pipeline] agent "${agent.id}" bridge error:`, err);
      this.metrics?.recordError('bridge', `agent "${agent.id}" LLM error: ${err}`);
      if (this.behavior.on_llm_unreachable === 'drop_and_alert') {
        this.metrics?.recordEventDropped();
        const alertEvent = createEvent('tunnlo:pipeline', 'ERROR', {
          message: `LLM bridge unreachable for agent "${agent.id}"`,
          error: String(err),
          dropped_event_id: event.event_id,
        });
        for (const handler of this.actionHandlers.values()) {
          try {
            await handler.execute({
              type: handler.type,
              config: {},
              payload: { event: alertEvent },
            });
          } catch {
            // best effort
          }
        }
      }
    }
  }

  private async consumeStream(agent: AgentEntry, event: TunnloEvent): Promise<import('./types.js').AgentResponse> {
    let content = '';
    let tokensUsed = 0;

    for await (const chunk of agent.bridge.stream!(event, agent.config.system_prompt)) {
      this.onStreamChunk!(agent.id, event, chunk);

      if (chunk.type === 'text' && chunk.text) {
        content += chunk.text;
      } else if (chunk.type === 'usage' && chunk.tokens_used !== undefined) {
        tokensUsed = chunk.tokens_used;
      }
    }

    return {
      content,
      tokens_used: tokensUsed,
      actions: this.parseActionsFromContent(content),
    };
  }

  private parseActionsFromContent(content: string): import('./types.js').ActionRequest[] | undefined {
    const actionMatch = content.match(/```json:actions\s*\r?\n([\s\S]*?)```/);
    if (!actionMatch) return undefined;
    try {
      return JSON.parse(actionMatch[1]);
    } catch {
      return undefined;
    }
  }
}

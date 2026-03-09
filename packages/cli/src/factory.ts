import type {
  Adapter,
  AdapterConfig,
  AgentBridge,
  AgentConfig,
  Filter,
  ActionHandler,
  FilterConfig,
  ActionConfig,
  MessageBus,
} from '@tunnlo/core';
import { InMemoryBus, RedisStreamsBus, KafkaBus, FastBus } from '@tunnlo/core';
import { TsharkAdapter, LogTailerAdapter, StdinAdapter, McpBridgeAdapter, KafkaAdapter, GoogleDocsAdapter } from '@tunnlo/adapters';
import {
  RateLimiterFilter,
  ContentFilter,
  DedupFilter,
  WindowedAggregationFilter,
  AdaptiveSamplingFilter,
  PriorityRouterFilter,
} from '@tunnlo/filters';
import { AnthropicBridge, OpenAIBridge, OllamaBridge, OpenClawBridge, LangGraphBridge, CrewAIBridge } from '@tunnlo/bridge-llm';
import { WebhookAction, ApprovalGateAction, McpToolAction } from '@tunnlo/actions';

export function createAdapter(config: AdapterConfig): Adapter {
  switch (config.adapter) {
    case 'native/tshark':
      return new TsharkAdapter();
    case 'native/log-tailer':
      return new LogTailerAdapter();
    case 'native/stdin':
      return new StdinAdapter();
    case 'mcp-bridge':
      return new McpBridgeAdapter();
    case 'kafka':
      return new KafkaAdapter();
    case 'google-docs':
      return new GoogleDocsAdapter();
    default:
      throw new Error(`Unknown adapter type: ${config.adapter}`);
  }
}

export function createFilter(config: FilterConfig): Filter {
  switch (config.type) {
    case 'rate-limiter':
      return new RateLimiterFilter({
        max_events_per_minute: config.max_events_per_minute ?? 60,
      });
    case 'content-filter':
      return new ContentFilter({
        rules: config.rules ?? [],
        mode: config.mode,
      });
    case 'dedup':
      return new DedupFilter({
        window_seconds: config.window_seconds ?? 30,
        key_fields: config.key_fields ?? ['payload'],
      });
    case 'windowed-aggregation':
      return new WindowedAggregationFilter({
        window_seconds: config.window_seconds ?? 60,
        max_batch_size: config.max_batch_size,
        summary_prompt: config.summary_prompt,
      });
    case 'adaptive-sampling':
      return new AdaptiveSamplingFilter({
        base_rate: config.base_rate ?? 0.5,
        min_rate: config.min_rate ?? 0.1,
        max_rate: config.max_rate ?? 1.0,
        velocity_window_seconds: config.velocity_window_seconds ?? 60,
        high_velocity_threshold: config.high_velocity_threshold ?? 100,
        low_velocity_threshold: config.low_velocity_threshold ?? 10,
      });
    case 'priority-router':
      return new PriorityRouterFilter({
        high_priority_threshold: config.high_priority_threshold,
        low_priority_threshold: config.low_priority_threshold,
        drop_low_priority: config.drop_low_priority,
      });
    default:
      throw new Error(`Unknown filter type: ${config.type}`);
  }
}

export function createBridge(agentConfig: AgentConfig): AgentBridge {
  const model = agentConfig.model;
  const runtime = agentConfig.runtime;

  if (runtime === 'openclaw') {
    return new OpenClawBridge({
      gateway_url: (agentConfig as any).gateway_url ?? 'ws://localhost:3000/ws',
      agent_id: (agentConfig as any).agent_id,
    });
  }

  if (runtime === 'langgraph') {
    return new LangGraphBridge({
      endpoint_url: (agentConfig as any).endpoint_url ?? 'http://localhost:8123',
      graph_id: (agentConfig as any).graph_id,
      thread_id: (agentConfig as any).thread_id,
    });
  }

  if (runtime === 'crewai') {
    return new CrewAIBridge({
      endpoint_url: (agentConfig as any).endpoint_url ?? 'http://localhost:8000',
      crew_id: (agentConfig as any).crew_id,
    });
  }

  // Parse model string: "anthropic/claude-sonnet-4-5" -> provider="anthropic", model="claude-sonnet-4-5"
  let provider: string;
  let modelName: string;

  if (model.includes('/')) {
    [provider, modelName] = model.split('/', 2);
  } else {
    provider = runtime === 'direct-llm' ? 'openai' : runtime;
    modelName = model;
  }

  switch (provider) {
    case 'anthropic':
      return new AnthropicBridge({ model: modelName });
    case 'openai':
      return new OpenAIBridge({ model: modelName });
    case 'ollama':
      return new OllamaBridge({ model: modelName });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export function createActionHandler(config: ActionConfig): ActionHandler {
  switch (config.type) {
    case 'webhook':
      return new WebhookAction({
        url: config.url,
        method: config.method,
        headers: config.headers,
      });
    case 'mcp-tool':
      return new McpToolAction({
        server_url: config.server_url ?? config.server,
        tool: config.tool,
      });
    case 'approval-gate': {
      const innerType = config.inner_type ?? 'webhook';
      if (innerType === 'approval-gate') {
        throw new Error('approval-gate cannot have inner_type of "approval-gate" (infinite recursion)');
      }
      const innerConfig = { ...config, type: innerType };
      const inner = createActionHandler(innerConfig);
      return new ApprovalGateAction({
        mode: config.mode ?? 'console',
        webhook_url: config.webhook_url,
        timeout_seconds: config.timeout_seconds,
        auto_deny_on_timeout: config.auto_deny_on_timeout,
        inner_handler: inner,
      });
    }
    default:
      throw new Error(`Unknown action type: ${config.type}`);
  }
}

export async function createBus(config?: { type?: string; url?: string; max_len?: number }): Promise<MessageBus> {
  const busType = config?.type ?? 'memory';

  switch (busType) {
    case 'memory':
      return new InMemoryBus();
    case 'redis': {
      const bus = new RedisStreamsBus({
        url: config?.url,
        maxLen: config?.max_len,
      });
      await bus.connect();
      return bus;
    }
    case 'kafka': {
      const busConfig = config as any;
      const bus = new KafkaBus({
        brokers: busConfig.brokers ?? ['localhost:9092'],
        clientId: busConfig.client_id,
        groupId: busConfig.group_id,
      });
      await bus.connect();
      return bus;
    }
    case 'fast':
      return new FastBus({
        batchSize: (config as any)?.batch_size,
        flushIntervalMs: (config as any)?.flush_interval_ms,
        maxQueueSize: (config as any)?.max_queue_size,
      });
    default:
      throw new Error(`Unknown bus type: ${busType}`);
  }
}

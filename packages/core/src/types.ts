export type EventType = 'DATA' | 'ALERT' | 'METRIC' | 'HEARTBEAT' | 'ERROR';

export interface TunnloEvent {
  event_id: string;
  source_id: string;
  timestamp: string;
  event_type: EventType;
  priority?: number;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  raw?: string | Buffer;
}

export type AdapterStatus = 'connected' | 'disconnected' | 'degraded' | 'error';

export interface AdapterHealth {
  status: AdapterStatus;
  message?: string;
  last_event_at?: string;
}

export interface AdapterConfig {
  id: string;
  adapter: string;
  config: Record<string, any>;
}

export interface RawEvent {
  data: string | Buffer;
  received_at: string;
}

export interface Adapter {
  connect(config: AdapterConfig): Promise<void>;
  read(): AsyncIterable<RawEvent>;
  transform(raw: RawEvent): TunnloEvent;
  disconnect(): Promise<void>;
  health(): AdapterHealth;
}

export interface CursorState {
  offset: string | number;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface StateStore {
  get(adapter_id: string): Promise<CursorState | null>;
  commit(adapter_id: string, state: CursorState): Promise<void>;
}

export interface Filter {
  name: string;
  process(event: TunnloEvent): TunnloEvent | null;
  flush?(): TunnloEvent | null;
}

export interface StreamChunk {
  type: 'text' | 'usage' | 'done';
  text?: string;
  tokens_used?: number;
}

export interface AgentBridge {
  send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse>;
  stream?(event: TunnloEvent, systemPrompt: string): AsyncIterable<StreamChunk>;
  close(): Promise<void>;
}

export interface AgentResponse {
  content: string;
  tokens_used: number;
  actions?: ActionRequest[];
}

export interface ActionRequest {
  type: string;
  config: Record<string, any>;
  payload: Record<string, any>;
}

export interface ActionHandler {
  type: string;
  execute(request: ActionRequest): Promise<ActionResult>;
}

export interface ActionResult {
  success: boolean;
  response?: any;
  error?: string;
}

export interface TokenBudget {
  max_per_hour: number;
  max_per_event: number;
}

export interface AgentConfig {
  id?: string;
  runtime: string;
  model: string;
  system_prompt: string;
  token_budget?: TokenBudget;
  actions?: ActionConfig[];
  /** When set, this agent only receives events from these source IDs. Omit for fan-out (all events). */
  sources?: string[];
}

export interface ActionConfig {
  type: string;
  [key: string]: any;
}

export interface BehaviorConfig {
  on_llm_unreachable: 'drop_and_alert' | 'buffer_limited' | 'passthrough';
  log_level?: 'debug' | 'info' | 'warn' | 'error' | 'quiet';
}

export interface BusConfig {
  type?: string;
  url?: string;
  max_len?: number;
  [key: string]: any;
}

export interface DashboardConfig {
  enabled?: boolean;
  port?: number;
  host?: string;
}

export interface OutputConfig {
  log_file?: string;
  log_format?: 'text' | 'json';
}

export interface PipelineConfig {
  sources: AdapterConfig[];
  filters: FilterConfig[];
  /** Single agent (backward compatible). Use `agent` or `agents`, not both. */
  agent?: AgentConfig;
  /** Multiple agents with optional per-agent source routing. */
  agents?: AgentConfig[];
  behavior?: BehaviorConfig;
  bus?: BusConfig;
  dashboard?: DashboardConfig;
  output?: OutputConfig;
}

export interface FilterConfig {
  type: string;
  [key: string]: any;
}

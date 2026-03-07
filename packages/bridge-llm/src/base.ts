import type { AgentBridge, AgentResponse, TunnloEvent } from '@tunnlo/core';

export interface LLMBridgeConfig {
  model: string;
  api_key?: string;
  base_url?: string;
  max_tokens?: number;
  timeout_ms?: number;
}

export abstract class BaseLLMBridge implements AgentBridge {
  protected config: LLMBridgeConfig;

  constructor(config: LLMBridgeConfig) {
    this.config = config;
  }

  abstract send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse>;

  async close(): Promise<void> {}

  protected formatEventForLLM(event: TunnloEvent): string {
    const sanitized = {
      event_id: event.event_id,
      source_id: event.source_id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      priority: event.priority,
      payload: event.payload,
      metadata: event.metadata,
    };
    return JSON.stringify(sanitized, null, 2);
  }

  protected parseActions(content: string): AgentResponse['actions'] {
    // Look for JSON action blocks in the response
    const actionMatch = content.match(/```json:actions\s*\r?\n([\s\S]*?)```/);
    if (!actionMatch) return undefined;

    try {
      return JSON.parse(actionMatch[1]);
    } catch {
      return undefined;
    }
  }
}

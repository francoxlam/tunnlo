import type { AgentBridge, AgentResponse, TunnloEvent } from '@tunnlo/core';

export interface LangGraphBridgeConfig {
  endpoint_url: string;
  graph_id?: string;
  thread_id?: string;
  api_key?: string;
}

export class LangGraphBridge implements AgentBridge {
  private config: LangGraphBridgeConfig;

  constructor(config: LangGraphBridgeConfig) {
    this.config = {
      endpoint_url: config.endpoint_url,
      graph_id: config.graph_id ?? 'default',
      thread_id: config.thread_id,
      api_key: config.api_key ?? process.env.LANGGRAPH_API_KEY,
    };
  }

  async send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse> {
    const sanitized = {
      event_id: event.event_id,
      source_id: event.source_id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      priority: event.priority,
      payload: event.payload,
      metadata: event.metadata,
    };

    const body: any = {
      input: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `New event received:\n\n${JSON.stringify(sanitized, null, 2)}` },
        ],
      },
      config: {
        configurable: {
          thread_id: this.config.thread_id ?? event.event_id,
        },
      },
    };

    const url = `${this.config.endpoint_url}/runs`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.api_key) {
      headers['x-api-key'] = this.config.api_key;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`LangGraph API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;

    // Extract the last AI message from the output
    const messages = data.output?.messages ?? data.messages ?? [];
    const lastAi = [...messages].reverse().find((m: any) => m.role === 'assistant' || m.type === 'ai');
    const content = lastAi?.content ?? JSON.stringify(data.output ?? data);

    return {
      content,
      tokens_used: data.usage?.total_tokens ?? data.metadata?.tokens_used ?? 0,
      actions: this.parseActions(content),
    };
  }

  async close(): Promise<void> {}

  private parseActions(content: string): AgentResponse['actions'] {
    const actionMatch = content.match(/```json:actions\s*\r?\n([\s\S]*?)```/);
    if (!actionMatch) return undefined;
    try {
      return JSON.parse(actionMatch[1]);
    } catch {
      return undefined;
    }
  }
}

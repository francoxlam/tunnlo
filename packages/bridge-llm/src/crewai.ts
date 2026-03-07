import type { AgentBridge, AgentResponse, TunnloEvent } from '@tunnlo/core';

export interface CrewAIBridgeConfig {
  endpoint_url: string;
  crew_id?: string;
  api_key?: string;
}

export class CrewAIBridge implements AgentBridge {
  private config: CrewAIBridgeConfig;

  constructor(config: CrewAIBridgeConfig) {
    this.config = {
      endpoint_url: config.endpoint_url,
      crew_id: config.crew_id ?? 'default',
      api_key: config.api_key ?? process.env.CREWAI_API_KEY,
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

    const body = {
      crew_id: this.config.crew_id,
      inputs: {
        system_prompt: systemPrompt,
        event: JSON.stringify(sanitized, null, 2),
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.api_key) {
      headers['Authorization'] = `Bearer ${this.config.api_key}`;
    }

    const response = await fetch(`${this.config.endpoint_url}/kickoff`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`CrewAI API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const content = data.result ?? data.output ?? JSON.stringify(data);

    return {
      content,
      tokens_used: data.tokens_used ?? data.usage?.total_tokens ?? 0,
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

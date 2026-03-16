import type { AgentBridge, AgentResponse, StreamChunk, TunnloEvent } from '@tunnlo/core';

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

  async *stream(event: TunnloEvent, systemPrompt: string): AsyncIterable<StreamChunk> {
    // Default: fall back to non-streaming send()
    const response = await this.send(event, systemPrompt);
    yield { type: 'text', text: response.content };
    yield { type: 'usage', tokens_used: response.tokens_used };
    yield { type: 'done' };
  }

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

  protected async *parseSSEStream(response: Response): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data && data !== '[DONE]') {
              yield data;
            }
          }
        }
      }
      // Process any remaining buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
          yield data;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

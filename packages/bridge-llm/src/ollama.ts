import type { AgentResponse, StreamChunk, TunnloEvent } from '@tunnlo/core';
import { BaseLLMBridge, type LLMBridgeConfig } from './base.js';

export class OllamaBridge extends BaseLLMBridge {
  constructor(config: LLMBridgeConfig) {
    super({
      ...config,
      base_url: config.base_url ?? 'http://localhost:11434',
    });
  }

  async send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse> {
    const body = {
      model: this.config.model,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `New event received:\n\n${this.formatEventForLLM(event)}`,
        },
      ],
    };

    const response = await fetch(`${this.config.base_url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout_ms ?? 300_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`Ollama API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const content = data.message?.content ?? '';
    const promptTokens = data.prompt_eval_count ?? 0;
    const evalTokens = data.eval_count ?? 0;

    return {
      content,
      tokens_used: promptTokens + evalTokens,
      actions: this.parseActions(content),
    };
  }

  async *stream(event: TunnloEvent, systemPrompt: string): AsyncIterable<StreamChunk> {
    const body = {
      model: this.config.model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `New event received:\n\n${this.formatEventForLLM(event)}`,
        },
      ],
    };

    const response = await fetch(`${this.config.base_url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout_ms ?? 300_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`Ollama API error ${response.status}: ${text}`);
    }

    // Ollama streams NDJSON (one JSON object per line)
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let totalTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const chunk = JSON.parse(trimmed);
            if (chunk.message?.content) {
              yield { type: 'text', text: chunk.message.content };
            }
            if (chunk.done) {
              totalTokens = (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'usage', tokens_used: totalTokens };
    yield { type: 'done' };
  }
}

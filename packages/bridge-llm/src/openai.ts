import type { AgentResponse, StreamChunk, TunnloEvent } from '@tunnlo/core';
import { BaseLLMBridge, type LLMBridgeConfig } from './base.js';

export class OpenAIBridge extends BaseLLMBridge {
  constructor(config: LLMBridgeConfig) {
    const apiKey = config.api_key ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('[tunnlo:bridge] api_key is required for OpenAI (set OPENAI_API_KEY or pass api_key)');
    }
    super({
      ...config,
      base_url: config.base_url ?? 'https://api.openai.com',
      api_key: apiKey,
    });
  }

  async send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse> {
    const body = {
      model: this.config.model,
      max_tokens: this.config.max_tokens ?? 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `New event received:\n\n${this.formatEventForLLM(event)}`,
        },
      ],
    };

    const response = await fetch(`${this.config.base_url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.api_key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout_ms ?? 120_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content ?? '';
    const totalTokens = data.usage?.total_tokens ?? 0;

    return {
      content,
      tokens_used: totalTokens,
      actions: this.parseActions(content),
    };
  }

  async *stream(event: TunnloEvent, systemPrompt: string): AsyncIterable<StreamChunk> {
    const body = {
      model: this.config.model,
      max_tokens: this.config.max_tokens ?? 4096,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `New event received:\n\n${this.formatEventForLLM(event)}`,
        },
      ],
    };

    const response = await fetch(`${this.config.base_url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.api_key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout_ms ?? 120_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    let totalTokens = 0;

    for await (const data of this.parseSSEStream(response)) {
      try {
        const parsed = JSON.parse(data);

        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: 'text', text: delta.content };
        }

        if (parsed.usage?.total_tokens) {
          totalTokens = parsed.usage.total_tokens;
        }
      } catch {
        // skip malformed chunks
      }
    }

    yield { type: 'usage', tokens_used: totalTokens };
    yield { type: 'done' };
  }
}

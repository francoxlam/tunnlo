import type { AgentResponse, TunnloEvent } from '@tunnlo/core';
import { BaseLLMBridge, type LLMBridgeConfig } from './base.js';

export class AnthropicBridge extends BaseLLMBridge {
  constructor(config: LLMBridgeConfig) {
    const apiKey = config.api_key ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('[tunnlo:bridge] api_key is required for Anthropic (set ANTHROPIC_API_KEY or pass api_key)');
    }
    super({
      ...config,
      base_url: config.base_url ?? 'https://api.anthropic.com',
      api_key: apiKey,
    });
  }

  async send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse> {
    const body = {
      model: this.config.model,
      max_tokens: this.config.max_tokens ?? 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `New event received:\n\n${this.formatEventForLLM(event)}`,
        },
      ],
    };

    const response = await fetch(`${this.config.base_url}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.api_key!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout_ms ?? 120_000),
    });

    if (!response.ok) {
      const text = (await response.text()).slice(0, 500);
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text ?? '';
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;

    return {
      content,
      tokens_used: inputTokens + outputTokens,
      actions: this.parseActions(content),
    };
  }
}

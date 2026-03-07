import type { AgentResponse, TunnloEvent } from '@tunnlo/core';
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
}

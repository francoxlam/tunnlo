import type { ActionHandler, ActionRequest, ActionResult } from '@tunnlo/core';
import { validateOutboundUrl } from '@tunnlo/core';

export interface WebhookActionConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export class WebhookAction implements ActionHandler {
  type = 'webhook';
  private url: string;
  private method: string;
  private headers: Record<string, string>;

  constructor(config: WebhookActionConfig) {
    validateOutboundUrl(config.url);
    this.url = config.url;
    this.method = config.method ?? 'POST';
    this.headers = config.headers ?? {};
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    try {
      const response = await fetch(this.url, {
        method: this.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(request.payload),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          error: `Webhook returned ${response.status}: ${text}`,
        };
      }

      let responseBody: any;
      const text = await response.text();
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }

      return {
        success: true,
        response: responseBody,
      };
    } catch (err) {
      return {
        success: false,
        error: `Webhook request failed: ${err}`,
      };
    }
  }
}

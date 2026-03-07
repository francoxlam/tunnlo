import type { AgentBridge, AgentResponse, TunnloEvent } from '@tunnlo/core';

export interface OpenClawBridgeConfig {
  gateway_url: string;
  agent_id?: string;
  api_key?: string;
}

export class OpenClawBridge implements AgentBridge {
  private config: OpenClawBridgeConfig;
  private ws: any = null;
  private responseQueue: Array<{
    resolve: (value: AgentResponse) => void;
    reject: (error: Error) => void;
    requestId: string;
  }> = [];

  constructor(config: OpenClawBridgeConfig) {
    this.config = {
      gateway_url: config.gateway_url,
      agent_id: config.agent_id,
      api_key: config.api_key ?? process.env.OPENCLAW_API_KEY,
    };
  }

  private async ensureConnection(): Promise<void> {
    if (this.ws && this.ws.readyState === 1) return; // WebSocket.OPEN

    const ws = await (Function('return import("ws")')() as Promise<any>);
    const WebSocket = ws.WebSocket ?? ws.default;
    const url = new URL(this.config.gateway_url);
    if (this.config.agent_id) {
      url.searchParams.set('agent_id', this.config.agent_id);
    }

    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        reject(new Error('OpenClaw WebSocket connection timed out after 30s'));
      }, 30_000);

      this.ws = new WebSocket(url.toString(), {
        headers: this.config.api_key
          ? { Authorization: `Bearer ${this.config.api_key}` }
          : {},
      });

      this.ws.on('open', () => { clearTimeout(connectTimeout); resolve(); });
      this.ws.on('error', (err: Error) => { clearTimeout(connectTimeout); reject(err); });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          // Match response to request by request_id if available, otherwise FIFO
          let pending: typeof this.responseQueue[number] | undefined;
          if (msg.request_id) {
            const idx = this.responseQueue.findIndex((p) => p.requestId === msg.request_id);
            if (idx !== -1) {
              pending = this.responseQueue.splice(idx, 1)[0];
            }
          }
          if (!pending) {
            pending = this.responseQueue.shift();
          }
          if (pending) {
            pending.resolve({
              content: msg.content ?? msg.text ?? JSON.stringify(msg),
              tokens_used: msg.tokens_used ?? msg.usage?.total_tokens ?? 0,
              actions: msg.actions,
            });
          }
        } catch (err) {
          const pending = this.responseQueue.shift();
          if (pending) {
            pending.reject(new Error(`Failed to parse OpenClaw response: ${err}`));
          }
        }
      });

      this.ws.on('close', () => {
        // Reject any pending requests
        for (const pending of this.responseQueue) {
          pending.reject(new Error('OpenClaw WebSocket closed'));
        }
        this.responseQueue = [];
      });
    });
  }

  async send(event: TunnloEvent, systemPrompt: string): Promise<AgentResponse> {
    await this.ensureConnection();

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = {
      type: 'event',
      request_id: requestId,
      system_prompt: systemPrompt,
      event: {
        event_id: event.event_id,
        source_id: event.source_id,
        timestamp: event.timestamp,
        event_type: event.event_type,
        priority: event.priority,
        payload: event.payload,
        metadata: event.metadata,
      },
    };

    return new Promise((resolve, reject) => {
      this.responseQueue.push({ resolve, reject, requestId });
      this.ws.send(JSON.stringify(message));
    });
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

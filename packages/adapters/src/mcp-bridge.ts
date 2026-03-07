import type { AdapterConfig, RawEvent } from '@tunnlo/core';
import { getLogger } from '@tunnlo/core';
import { BaseAdapter } from './base.js';

export interface McpBridgeConfig {
  mcp_server_url: string;
  poll_interval_seconds: number;
  on_demand?: boolean;
  tools?: string[];
  resources?: string[];
}

export class McpBridgeAdapter extends BaseAdapter {
  private polling = false;
  private pollIntervalMs = 30_000;
  private serverUrl = '';
  private onDemand = false;
  private tools: string[] = [];
  private resources: string[] = [];
  private pendingRequests: Array<{ tool: string; args: Record<string, any> }> = [];
  private requestId = 0;

  async connect(config: AdapterConfig): Promise<void> {
    await super.connect(config);
    const mcpConfig = config.config as McpBridgeConfig;
    this.serverUrl = mcpConfig.mcp_server_url;
    this.pollIntervalMs = (mcpConfig.poll_interval_seconds ?? 30) * 1000;
    this.onDemand = mcpConfig.on_demand ?? false;
    this.tools = mcpConfig.tools ?? [];
    this.resources = mcpConfig.resources ?? [];
    this.polling = !this.onDemand;
  }

  async *read(): AsyncIterable<RawEvent> {
    if (this.onDemand) {
      // On-demand mode: yield results as requests come in
      while (this.status !== 'disconnected') {
        if (this.pendingRequests.length > 0) {
          const request = this.pendingRequests.shift()!;
          try {
            const result = await this.callTool(request.tool, request.args);
            this.status = 'connected';
            yield {
              data: JSON.stringify(result),
              received_at: new Date().toISOString(),
            };
          } catch (err) {
            this.status = 'degraded';
            yield {
              data: JSON.stringify({ error: String(err), tool: request.tool }),
              received_at: new Date().toISOString(),
            };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } else {
      // Polling mode: poll resources/tools on interval
      while (this.polling && this.status !== 'disconnected') {
        try {
          // Poll configured resources
          for (const resource of this.resources) {
            const result = await this.readResource(resource);
            yield {
              data: JSON.stringify({ resource, data: result }),
              received_at: new Date().toISOString(),
            };
          }

          // Poll configured tools
          for (const tool of this.tools) {
            const result = await this.callTool(tool, {});
            yield {
              data: JSON.stringify({ tool, data: result }),
              received_at: new Date().toISOString(),
            };
          }
          this.status = 'connected';
        } catch (err) {
          this.status = 'degraded';
          getLogger().error(`[tunnlo:mcp-bridge] poll error:`, err);
        }

        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  triggerTool(tool: string, args: Record<string, any> = {}): void {
    this.pendingRequests.push({ tool, args });
  }

  private async callTool(tool: string, args: Record<string, any>): Promise<any> {
    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const data = await response.json() as any;
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }

    return data.result;
  }

  private async readResource(uri: string): Promise<any> {
    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method: 'resources/read',
        params: { uri },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const data = await response.json() as any;
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }

    return data.result;
  }

  async disconnect(): Promise<void> {
    this.polling = false;
    this.pendingRequests = [];
    await super.disconnect();
  }
}

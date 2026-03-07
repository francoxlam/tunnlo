import type { ActionHandler, ActionRequest, ActionResult } from '@tunnlo/core';
import { validateOutboundUrl } from '@tunnlo/core';

export interface McpToolActionConfig {
  server_url: string;
  tool: string;
}

export class McpToolAction implements ActionHandler {
  type = 'mcp-tool';
  private serverUrl: string;
  private defaultTool: string;
  private requestId = 0;

  constructor(config: McpToolActionConfig) {
    validateOutboundUrl(config.server_url);
    this.serverUrl = config.server_url;
    this.defaultTool = config.tool;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    const tool = request.config?.tool ?? this.defaultTool;
    const args = request.payload;

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++this.requestId,
          method: 'tools/call',
          params: { name: tool, arguments: args },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `MCP server returned ${response.status}: ${text}` };
      }

      const data = await response.json() as any;
      if (data.error) {
        return { success: false, error: `MCP error: ${data.error?.message ?? JSON.stringify(data.error)}` };
      }

      return { success: true, response: data.result };
    } catch (err) {
      return { success: false, error: `MCP tool call failed: ${err}` };
    }
  }
}

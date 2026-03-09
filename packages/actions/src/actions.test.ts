import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookAction } from './webhook.js';
import { McpToolAction } from './mcp-tool.js';
import { ApprovalGateAction } from './approval-gate.js';
import type { ActionHandler, ActionRequest } from '@tunnlo/core';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    type: 'webhook',
    config: {},
    payload: { message: 'test event' },
    ...overrides,
  };
}

describe('WebhookAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends POST request with payload as JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"status":"ok"}',
    });

    const action = new WebhookAction({ url: 'https://example.com/hook' });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ status: 'ok' });

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test event' }),
    });
  });

  it('supports custom HTTP method and headers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '"done"',
    });

    const action = new WebhookAction({
      url: 'https://example.com/hook',
      method: 'PUT',
      headers: { Authorization: 'Bearer token123' },
    });
    await action.execute(makeRequest());

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/hook', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token123',
      },
      body: expect.any(String),
    });
  });

  it('returns error on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const action = new WebhookAction({ url: 'https://example.com/hook' });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
    expect(result.error).toContain('Internal Server Error');
  });

  it('handles non-JSON response body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => 'plain text response',
    });

    const action = new WebhookAction({ url: 'https://example.com/hook' });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(true);
    expect(result.response).toBe('plain text response');
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const action = new WebhookAction({ url: 'https://example.com/hook' });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

describe('McpToolAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends JSON-RPC 2.0 tool call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: { output: 'done' } }),
    });

    const action = new McpToolAction({
      server_url: 'https://mcp.example.com',
      tool: 'summarize',
    });
    const result = await action.execute(makeRequest({ payload: { text: 'hello' } }));

    expect(result.success).toBe(true);
    expect(result.response).toEqual({ output: 'done' });

    const call = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(call.jsonrpc).toBe('2.0');
    expect(call.method).toBe('tools/call');
    expect(call.params.name).toBe('summarize');
    expect(call.params.arguments).toEqual({ text: 'hello' });
  });

  it('allows overriding tool name via request config', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: {} }),
    });

    const action = new McpToolAction({
      server_url: 'https://mcp.example.com',
      tool: 'default-tool',
    });
    await action.execute(makeRequest({ config: { tool: 'override-tool' } }));

    const call = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(call.params.name).toBe('override-tool');
  });

  it('increments request IDs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: {} }),
    });

    const action = new McpToolAction({
      server_url: 'https://mcp.example.com',
      tool: 'test',
    });

    await action.execute(makeRequest());
    await action.execute(makeRequest());

    const call1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    const call2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(call2.id).toBe(call1.id + 1);
  });

  it('returns error on MCP error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Tool not found' },
      }),
    });

    const action = new McpToolAction({
      server_url: 'https://mcp.example.com',
      tool: 'missing',
    });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool not found');
  });

  it('returns error on non-OK HTTP response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });

    const action = new McpToolAction({
      server_url: 'https://mcp.example.com',
      tool: 'test',
    });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain('502');
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const action = new McpToolAction({
      server_url: 'https://mcp.example.com',
      tool: 'test',
    });
    const result = await action.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection refused');
  });
});

describe('ApprovalGateAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes inner handler when webhook approves', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ approved: true }),
    });

    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn().mockResolvedValue({ success: true, response: 'done' }),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      webhook_url: 'https://approvals.example.com',
      inner_handler: innerHandler,
    });

    const result = await gate.execute(makeRequest());

    expect(result.success).toBe(true);
    expect(innerHandler.execute).toHaveBeenCalledOnce();
  });

  it('blocks inner handler when webhook denies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ approved: false }),
    });

    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn(),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      webhook_url: 'https://approvals.example.com',
      inner_handler: innerHandler,
    });

    const result = await gate.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(result.error).toContain('denied');
    expect(innerHandler.execute).not.toHaveBeenCalled();
  });

  it('sends approval request with description to webhook', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ approved: true }),
    });

    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn().mockResolvedValue({ success: true }),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      webhook_url: 'https://approvals.example.com',
      timeout_seconds: 30,
      inner_handler: innerHandler,
    });

    await gate.execute(makeRequest());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe('approval_request');
    expect(body.description).toContain('Approval Required');
    expect(body.timeout_seconds).toBe(30);
  });

  it('auto-denies on webhook failure when auto_deny_on_timeout is true', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn(),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      webhook_url: 'https://approvals.example.com',
      auto_deny_on_timeout: true,
      inner_handler: innerHandler,
    });

    const result = await gate.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(innerHandler.execute).not.toHaveBeenCalled();
  });

  it('auto-approves on webhook failure when auto_deny_on_timeout is false', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn().mockResolvedValue({ success: true, response: 'executed' }),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      webhook_url: 'https://approvals.example.com',
      auto_deny_on_timeout: false,
      inner_handler: innerHandler,
    });

    const result = await gate.execute(makeRequest());

    expect(result.success).toBe(true);
    expect(innerHandler.execute).toHaveBeenCalledOnce();
  });

  it('denies when webhook mode has no URL configured', async () => {
    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn(),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      inner_handler: innerHandler,
    });

    const result = await gate.execute(makeRequest());

    expect(result.success).toBe(false);
    expect(innerHandler.execute).not.toHaveBeenCalled();
  });

  it('truncates long payloads in description', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ approved: true }),
    });

    const innerHandler: ActionHandler = {
      type: 'webhook',
      execute: vi.fn().mockResolvedValue({ success: true }),
    };

    const gate = new ApprovalGateAction({
      mode: 'webhook',
      webhook_url: 'https://approvals.example.com',
      inner_handler: innerHandler,
    });

    const bigPayload = { data: 'x'.repeat(1000) };
    await gate.execute(makeRequest({ payload: bigPayload }));

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.description).toContain('truncated');
  });
});

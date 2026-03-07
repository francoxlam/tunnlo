import { createInterface } from 'node:readline';
import type { ActionHandler, ActionRequest, ActionResult } from '@tunnlo/core';
import { validateOutboundUrl } from '@tunnlo/core';

export interface ApprovalGateConfig {
  mode: 'console' | 'webhook';
  webhook_url?: string;
  timeout_seconds?: number;
  auto_deny_on_timeout?: boolean;
  inner_handler: ActionHandler;
}

export class ApprovalGateAction implements ActionHandler {
  type = 'approval-gate';
  private mode: 'console' | 'webhook';
  private webhookUrl?: string;
  private timeoutMs: number;
  private autoDeny: boolean;
  private innerHandler: ActionHandler;

  constructor(config: ApprovalGateConfig) {
    this.mode = config.mode;
    if (config.webhook_url) {
      validateOutboundUrl(config.webhook_url);
    }
    this.webhookUrl = config.webhook_url;
    this.timeoutMs = (config.timeout_seconds ?? 60) * 1000;
    this.autoDeny = config.auto_deny_on_timeout ?? true;
    this.innerHandler = config.inner_handler;
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    const description = this.describeAction(request);
    const approved = await this.requestApproval(description);

    if (!approved) {
      return {
        success: false,
        error: 'Action denied by approval gate',
      };
    }

    return this.innerHandler.execute(request);
  }

  private describeAction(request: ActionRequest): string {
    const payloadStr = JSON.stringify(request.payload, null, 2);
    const truncated = payloadStr.length > 500
      ? payloadStr.slice(0, 500) + '... [truncated]'
      : payloadStr;
    return `[Approval Required]\nAction: ${request.type}\nPayload: ${truncated}`;
  }

  private async requestApproval(description: string): Promise<boolean> {
    if (this.mode === 'console') {
      return this.consoleApproval(description);
    }
    return this.webhookApproval(description);
  }

  private consoleApproval(description: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      console.log('\n' + description);
      console.log('\nApprove this action? (y/n): ');

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.log(`\nApproval timed out after ${this.timeoutMs / 1000}s. ${this.autoDeny ? 'Denied.' : 'Approved.'}`);
        rl.close();
        resolve(!this.autoDeny);
      }, this.timeoutMs);

      rl.question('', (answer) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rl.close();
        resolve(answer.trim().toLowerCase().startsWith('y'));
      });
    });
  }

  private async webhookApproval(description: string): Promise<boolean> {
    if (!this.webhookUrl) {
      console.warn('[tunnlo:approval-gate] webhook mode but no webhook_url configured, denying');
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'approval_request',
          description,
          timeout_seconds: this.timeoutMs / 1000,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return !this.autoDeny;
      }

      const data = await response.json() as any;
      return data.approved === true;
    } catch {
      console.warn('[tunnlo:approval-gate] webhook request failed, using default');
      return !this.autoDeny;
    }
  }
}

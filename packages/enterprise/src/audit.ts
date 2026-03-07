import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  resource: string;
  resource_id?: string;
  tenant_id?: string;
  details?: Record<string, any>;
  result: 'success' | 'denied' | 'error';
}

export interface AuditStore {
  log(entry: AuditEntry): Promise<void>;
  query(options: AuditQueryOptions): Promise<AuditEntry[]>;
}

export interface AuditQueryOptions {
  actor?: string;
  action?: string;
  resource?: string;
  tenant_id?: string;
  result?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export class FileAuditStore implements AuditStore {
  private filePath: string;
  private entries: AuditEntry[] = [];
  private maxEntries: number;

  constructor(filePath: string, maxEntries = 10_000) {
    this.filePath = filePath;
    this.maxEntries = maxEntries;
  }

  async log(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('[tunnlo:audit] Failed to write audit log:', err);
    }
  }

  async query(options: AuditQueryOptions): Promise<AuditEntry[]> {
    let results = [...this.entries];

    if (options.actor) {
      results = results.filter((e) => e.actor === options.actor);
    }
    if (options.action) {
      results = results.filter((e) => e.action === options.action);
    }
    if (options.resource) {
      results = results.filter((e) => e.resource === options.resource);
    }
    if (options.tenant_id) {
      results = results.filter((e) => e.tenant_id === options.tenant_id);
    }
    if (options.result) {
      results = results.filter((e) => e.result === options.result);
    }
    if (options.from) {
      results = results.filter((e) => e.timestamp >= options.from!);
    }
    if (options.to) {
      results = results.filter((e) => e.timestamp <= options.to!);
    }

    const limit = options.limit ?? 100;
    return results.slice(-limit);
  }
}

export class AuditLogger {
  private store: AuditStore;

  constructor(store: AuditStore) {
    this.store = store;
  }

  async logAction(
    actor: string,
    action: string,
    resource: string,
    result: AuditEntry['result'],
    details?: Record<string, any>,
  ): Promise<void> {
    await this.store.log({
      timestamp: new Date().toISOString(),
      actor,
      action,
      resource,
      result,
      details,
    });
  }

  async logPipelineStart(actor: string, configSources: string[]): Promise<void> {
    await this.logAction(actor, 'pipeline:start', 'pipeline', 'success', { sources: configSources });
  }

  async logPipelineStop(actor: string): Promise<void> {
    await this.logAction(actor, 'pipeline:stop', 'pipeline', 'success');
  }

  async logConfigChange(actor: string, changeType: string, details?: Record<string, any>): Promise<void> {
    await this.logAction(actor, 'config:write', changeType, 'success', details);
  }

  async logAccessDenied(actor: string, action: string, resource: string): Promise<void> {
    await this.logAction(actor, action, resource, 'denied');
  }

  async query(options: AuditQueryOptions): Promise<AuditEntry[]> {
    return this.store.query(options);
  }
}

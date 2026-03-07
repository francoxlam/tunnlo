import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { MetricsCollector } from './metrics.js';
import type { PipelineConfig } from '@tunnlo/core';
import { getLogger } from '@tunnlo/core';
import { DASHBOARD_HTML } from './html.js';
import { EDITOR_HTML } from './editor-html.js';

export interface DashboardConfig {
  port?: number;
  host?: string;
}

const SENSITIVE_KEYS = new Set([
  'api_key', 'apiKey', 'secret', 'password', 'token',
  'webhook_url', 'url', 'connection_string',
]);

function redactValue(key: string, value: any): any {
  if (typeof value === 'string' && SENSITIVE_KEYS.has(key)) {
    return value.length > 4 ? value.slice(0, 4) + '***' : '***';
  }
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v));
  if (value && typeof value === 'object') return redactObject(value);
  return value;
}

function redactObject(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = redactValue(key, value);
  }
  return result;
}

export class DashboardServer {
  private server: Server | null = null;
  private metrics: MetricsCollector;
  private port: number;
  private host: string;
  private pipelineConfig?: PipelineConfig;

  constructor(metrics: MetricsCollector, config: DashboardConfig = {}) {
    this.metrics = metrics;
    this.port = config.port ?? 4400;
    this.host = config.host ?? 'localhost';
  }

  setPipelineConfig(config: PipelineConfig): void {
    this.pipelineConfig = config;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      try {
      const url = new URL(req.url ?? '/', `http://${this.host}:${this.port}`);

      const origin = req.headers.origin ?? '';
      let allowedOrigin = `http://${this.host}:${this.port}`;
      try {
        if (origin && new URL(origin).hostname === this.host) allowedOrigin = origin;
      } catch { /* invalid origin header, use default */ }
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/api/metrics') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.metrics.getMetrics()));
        return;
      }

      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: this.metrics.getMetrics().uptime_seconds }));
        return;
      }

      if (url.pathname === '/api/config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const safe = this.pipelineConfig ? redactObject(this.pipelineConfig as any) : {};
        res.end(JSON.stringify(safe));
        return;
      }

      if (url.pathname === '/api/adapters') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.metrics.getMetrics().adapters));
        return;
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(DASHBOARD_HTML);
        return;
      }

      if (url.pathname === '/editor') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(EDITOR_HTML);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      } catch (err) {
        getLogger().error('[tunnlo:dashboard] Request error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    return new Promise((resolve, reject) => {
      const startupErrorHandler = (err: Error) => {
        reject(new Error(`[tunnlo:dashboard] Failed to start: ${err.message}`));
      };
      this.server!.on('error', startupErrorHandler);
      this.server!.listen(this.port, this.host, () => {
        this.server!.removeListener('error', startupErrorHandler);
        this.server!.on('error', (err) => {
          getLogger().error('[tunnlo:dashboard] Server error:', err);
        });
        getLogger().info(`[tunnlo:dashboard] Dashboard running at http://${this.host}:${this.port}`);
        getLogger().info(`[tunnlo:dashboard] Filter editor at http://${this.host}:${this.port}/editor`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        const timeout = setTimeout(() => {
          this.server?.closeAllConnections?.();
          resolve();
        }, 5000);
        this.server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

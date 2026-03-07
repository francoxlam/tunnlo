import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AdapterConfig, RawEvent } from '@tunnlo/core';
import { getLogger } from '@tunnlo/core';
import { BaseAdapter } from './base.js';

const MAX_JSON_BUFFER = 50 * 1024 * 1024; // 50MB

export class TsharkAdapter extends BaseAdapter {
  private process: ChildProcess | null = null;

  async connect(config: AdapterConfig): Promise<void> {
    await super.connect(config);

    const iface = config.config.interface ?? 'eth0';
    const captureFilter = config.config.capture_filter ?? '';
    const outputFormat = config.config.output_format ?? 'json';

    const args = ['-i', iface, '-l'];

    if (outputFormat === 'json') {
      args.push('-T', 'json');
    } else if (outputFormat === 'ek') {
      args.push('-T', 'ek');
    }

    if (captureFilter) {
      args.push('-f', captureFilter);
    }

    this.process = spawn('tshark', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    this.process.on('error', (err) => {
      this.status = 'error';
      getLogger().error(`[tunnlo:tshark] process error:`, err.message);
    });

    this.process.on('exit', (code) => {
      if (this.status !== 'disconnected') {
        this.status = code === 0 ? 'disconnected' : 'error';
      }
    });
  }

  async *read(): AsyncIterable<RawEvent> {
    if (!this.process?.stdout) {
      throw new Error('tshark process not started');
    }

    const rl = createInterface({ input: this.process.stdout });

    let jsonBuffer = '';

    try {
      for await (const line of rl) {
        if (!line.trim()) continue;

        if (this.config.config.output_format === 'json') {
          jsonBuffer += line;
          if (jsonBuffer.length > MAX_JSON_BUFFER) {
            getLogger().warn('[tunnlo:tshark] JSON buffer exceeded 50MB, discarding');
            jsonBuffer = '';
            continue;
          }
          try {
            JSON.parse(jsonBuffer);
            yield {
              data: jsonBuffer,
              received_at: new Date().toISOString(),
            };
            jsonBuffer = '';
          } catch {
            // incomplete JSON, continue buffering
          }
        } else {
          yield {
            data: line,
            received_at: new Date().toISOString(),
          };
        }
      }
    } finally {
      rl.close();
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.removeAllListeners();
      this.process.kill('SIGTERM');
      this.process = null;
    }
    await super.disconnect();
  }
}

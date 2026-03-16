import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { platform } from 'node:os';
import type { Adapter, AdapterConfig, AdapterHealth, RawEvent, TunnloEvent } from '@tunnlo/core';
import { createEvent } from '@tunnlo/core';

/**
 * Adapter that uses macOS `log stream` or Linux `journalctl -f` to capture
 * live system logs. These are the actual log sources on modern systems —
 * /var/log/system.log is mostly dead on macOS 12+.
 */
export class LogStreamAdapter implements Adapter {
  private process: ChildProcess | null = null;
  private connected = false;
  private lastEventAt?: string;
  private configId = 'system-logs';

  async connect(config: AdapterConfig): Promise<void> {
    this.configId = config.id;
    this.connected = true;
  }

  async *read(): AsyncIterable<RawEvent> {
    const os = platform();
    let cmd: string;
    let args: string[];

    if (os === 'darwin') {
      cmd = 'log';
      args = ['stream', '--style', 'compact', '--level', 'default'];
    } else {
      cmd = 'journalctl';
      args = ['-f', '--no-pager', '-o', 'short'];
    }

    this.process = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (!this.process.stdout) {
      throw new Error(`Failed to spawn ${cmd}`);
    }

    const rl = createInterface({ input: this.process.stdout });
    let firstLine = true;

    try {
      for await (const line of rl) {
        // macOS `log stream` prints a header line first — skip it
        if (firstLine && platform() === 'darwin') {
          firstLine = false;
          if (line.startsWith('Filtering the log data') || line.startsWith('Timestamp')) {
            continue;
          }
        }
        firstLine = false;

        if (!line.trim()) continue;

        yield {
          data: line,
          received_at: new Date().toISOString(),
        };
      }
    } finally {
      rl.close();
    }
  }

  transform(raw: RawEvent): TunnloEvent {
    this.lastEventAt = new Date().toISOString();
    return createEvent(this.configId, 'DATA', {
      data: typeof raw.data === 'string' ? raw.data : raw.data.toString('utf-8'),
    }, { raw: raw.data });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  health(): AdapterHealth {
    return {
      status: this.connected ? 'connected' : 'disconnected',
      last_event_at: this.lastEventAt,
    };
  }
}

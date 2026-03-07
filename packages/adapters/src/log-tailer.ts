import { open, stat } from 'node:fs/promises';
import type { AdapterConfig, RawEvent } from '@tunnlo/core';
import { BaseAdapter } from './base.js';

export class LogTailerAdapter extends BaseAdapter {
  private watching = false;
  private filePath = '';
  private pollIntervalMs = 500;
  private partialLine = '';

  async connect(config: AdapterConfig): Promise<void> {
    await super.connect(config);
    this.filePath = config.config.file_path;
    this.pollIntervalMs = config.config.poll_interval_ms ?? 500;
    if (!this.filePath) {
      throw new Error('log-tailer requires config.file_path');
    }
    this.watching = true;
  }

  async *read(): AsyncIterable<RawEvent> {
    let offset = 0;
    this.partialLine = '';

    // Start from end of file if it exists
    try {
      const stats = await stat(this.filePath);
      offset = stats.size;
    } catch {
      // file doesn't exist yet, start from 0
    }

    while (this.watching) {
      try {
        const stats = await stat(this.filePath);
        if (stats.size > offset) {
          const fh = await open(this.filePath, 'r');
          try {
            const MAX_CHUNK = 10 * 1024 * 1024; // 10MB max per read
            const readSize = Math.min(stats.size - offset, MAX_CHUNK);
            const buf = Buffer.alloc(readSize);
            await fh.read(buf, 0, buf.length, offset);
            offset += readSize;

            const text = this.partialLine + buf.toString('utf-8');
            const lines = text.split('\n');
            // Last element may be incomplete if chunk didn't end on newline
            this.partialLine = lines.pop() ?? '';
            for (const line of lines) {
              if (line.trim()) {
                yield {
                  data: line,
                  received_at: new Date().toISOString(),
                };
              }
            }
          } finally {
            await fh.close();
          }
        } else if (stats.size < offset) {
          // File was truncated/rotated
          offset = 0;
        }
      } catch {
        // file doesn't exist yet, wait
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    // Flush any remaining partial line on shutdown
    if (this.partialLine.trim()) {
      yield {
        data: this.partialLine,
        received_at: new Date().toISOString(),
      };
      this.partialLine = '';
    }
  }

  async disconnect(): Promise<void> {
    this.watching = false;
    await super.disconnect();
  }
}

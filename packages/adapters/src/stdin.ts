import { createInterface } from 'node:readline';
import type { AdapterConfig, RawEvent } from '@tunnlo/core';
import { BaseAdapter } from './base.js';

export class StdinAdapter extends BaseAdapter {
  private inputStream: NodeJS.ReadableStream = process.stdin;

  async connect(config: AdapterConfig): Promise<void> {
    await super.connect(config);
    if (config.config?.input_stream) {
      this.inputStream = config.config.input_stream;
    }
  }

  async *read(): AsyncIterable<RawEvent> {
    const rl = createInterface({ input: this.inputStream });

    try {
      for await (const line of rl) {
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
}

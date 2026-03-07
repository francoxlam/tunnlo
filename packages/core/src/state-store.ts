import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CursorState, StateStore } from './types.js';

export class JsonFileStateStore implements StateStore {
  private state: Record<string, CursorState> = {};
  private loaded = false;

  constructor(private filePath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await readFile(this.filePath, 'utf-8');
      this.state = JSON.parse(data);
    } catch {
      this.state = {};
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2));
  }

  async get(adapter_id: string): Promise<CursorState | null> {
    await this.load();
    return this.state[adapter_id] ?? null;
  }

  async commit(adapter_id: string, state: CursorState): Promise<void> {
    await this.load();
    this.state[adapter_id] = state;
    await this.save();
  }
}

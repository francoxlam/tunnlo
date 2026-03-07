import type { Adapter, AdapterConfig } from '@tunnlo/core';

export interface AdapterRegistryEntry {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  factory: (config: AdapterConfig) => Adapter;
}

export class AdapterRegistry {
  private adapters = new Map<string, AdapterRegistryEntry>();

  register(entry: AdapterRegistryEntry): void {
    if (this.adapters.has(entry.name)) {
      throw new Error(`Adapter "${entry.name}" is already registered`);
    }
    this.adapters.set(entry.name, entry);
  }

  unregister(name: string): boolean {
    return this.adapters.delete(name);
  }

  get(name: string): AdapterRegistryEntry | undefined {
    return this.adapters.get(name);
  }

  create(name: string, config: AdapterConfig): Adapter {
    const entry = this.adapters.get(name);
    if (!entry) {
      throw new Error(`Adapter "${name}" not found in registry. Available: ${this.list().map(a => a.name).join(', ')}`);
    }
    return entry.factory(config);
  }

  list(): AdapterRegistryEntry[] {
    return [...this.adapters.values()];
  }

  search(query: string): AdapterRegistryEntry[] {
    const lower = query.toLowerCase();
    return this.list().filter((entry) => {
      return (
        entry.name.toLowerCase().includes(lower) ||
        entry.description.toLowerCase().includes(lower) ||
        entry.tags?.some((t) => t.toLowerCase().includes(lower))
      );
    });
  }

  toJSON(): Array<Omit<AdapterRegistryEntry, 'factory'>> {
    return this.list().map(({ factory, ...rest }) => rest);
  }
}

// Global singleton registry
export const globalRegistry = new AdapterRegistry();

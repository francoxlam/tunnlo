export function createAdapterTemplate(name: string, type: 'push' | 'poll'): string {
  const className = name.replace(/(?:^|[-_])(\w)/g, (_, c) => c.toUpperCase()) + 'Adapter';

  if (type === 'push') {
    return `import type { AdapterConfig } from '@tunnlo/core';
import { PushAdapter } from '@tunnlo/adapter-sdk';

export class ${className} extends PushAdapter {
  protected async onConnect(config: AdapterConfig): Promise<void> {
    // Initialize your data source connection here
    // Call this.emit(data) whenever new data arrives
    console.log('${className} connected with config:', config.config);
  }

  protected async onDisconnect(): Promise<void> {
    // Clean up your data source connection here
    console.log('${className} disconnected');
  }
}
`;
  }

  return `import type { AdapterConfig, RawEvent, CursorState } from '@tunnlo/core';
import { PollingAdapter } from '@tunnlo/adapter-sdk';

export class ${className} extends PollingAdapter {
  private lastOffset: string | number = 0;

  protected async onConnect(config: AdapterConfig): Promise<void> {
    // Initialize your data source connection here
    console.log('${className} connected with config:', config.config);
  }

  protected async onDisconnect(): Promise<void> {
    // Clean up your data source connection here
    console.log('${className} disconnected');
  }

  protected async poll(cursor?: CursorState): Promise<RawEvent[]> {
    // Fetch new data from your source since the last cursor position
    // Return an array of RawEvent objects
    const startFrom = cursor?.offset ?? 0;

    // Example: fetch data from an API
    // const response = await fetch(\`https://api.example.com/data?since=\${startFrom}\`);
    // const data = await response.json();

    // this.lastOffset = data.nextCursor;
    // return data.items.map(item => ({
    //   data: JSON.stringify(item),
    //   received_at: new Date().toISOString(),
    // }));

    return [];
  }

  protected getCursorOffset(): string | number {
    return this.lastOffset;
  }
}
`;
}

# @tunnlo/adapter-sdk

SDK for building custom Tunnlo adapters.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/adapter-sdk
```

## Usage

```ts
import { PollingAdapter } from '@tunnlo/adapter-sdk';
import type { TunnloEvent } from '@tunnlo/core';

class MyApiAdapter extends PollingAdapter {
  async poll(): Promise<TunnloEvent[]> {
    const data = await fetch('https://api.example.com/events');
    const items = await data.json();
    return items.map((item: any) => this.createEvent('api', item));
  }
}
```

### Testing Your Adapter

```ts
import { AdapterTestHarness } from '@tunnlo/adapter-sdk';

const harness = new AdapterTestHarness(MyApiAdapter, {
  id: 'test',
  type: 'my-api',
  config: {},
});

const events = await harness.collectEvents(5);
console.log(`Received ${events.length} events`);
```

## API

- **`PollingAdapter`** -- base class for adapters that periodically fetch data
- **`PushAdapter`** -- base class for adapters that receive data via callbacks or streams
- **`AdapterTestHarness`** -- test utility for verifying adapter behavior
- **`createAdapterTemplate(name)`** -- generates boilerplate files for a new adapter
- **`AdapterRegistry`** -- registry for discovering and loading adapters
- **`globalRegistry`** -- shared global adapter registry instance

## License

MIT

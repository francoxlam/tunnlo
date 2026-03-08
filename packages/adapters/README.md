# @tunnlo/adapters

Built-in data source adapters for Tunnlo pipelines.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/adapters
```

## Usage

```ts
import { LogTailerAdapter } from '@tunnlo/adapters';

const adapter = new LogTailerAdapter({
  id: 'app-logs',
  type: 'log-tailer',
  config: { path: '/var/log/app.log' },
});

await adapter.start((event) => {
  console.log('New log line:', event.payload);
});
```

## API

- **`TsharkAdapter`** -- captures live network traffic via tshark/Wireshark
- **`LogTailerAdapter`** -- tails log files for new lines
- **`StdinAdapter`** -- reads events from standard input
- **`McpBridgeAdapter`** -- receives events from an MCP-compatible server
- **`HybridAdapter`** -- combines push and polling strategies in a single adapter
- **`BaseAdapter`** -- abstract base class for building custom adapters

## License

MIT

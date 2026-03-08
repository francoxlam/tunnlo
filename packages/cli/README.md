# @tunnlo/cli

CLI for running and managing Tunnlo pipelines.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install -g @tunnlo/cli
```

## Usage

```bash
# Start a pipeline from a YAML config
tunnlo start tunnlo.yaml

# Validate a config file without running it
tunnlo validate tunnlo.yaml
```

### Programmatic Usage

```ts
import { loadConfig, buildAndRun } from '@tunnlo/cli';

const config = await loadConfig('tunnlo.yaml');
const result = await buildAndRun(config);
```

## API

- **`loadConfig(path)`** -- loads and validates a YAML pipeline configuration file
- **`buildAndRun(config)`** -- builds a pipeline from config and starts it
- **`createAdapter(config)`** -- factory for creating adapter instances
- **`createFilter(config)`** -- factory for creating filter instances
- **`createBridge(config)`** -- factory for creating LLM bridge instances
- **`createActionHandler(config)`** -- factory for creating action handlers
- **`createBus(config)`** -- factory for creating message bus instances

## License

MIT

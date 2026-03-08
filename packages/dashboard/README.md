# @tunnlo/dashboard

Web dashboard for monitoring Tunnlo pipeline metrics in real time.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/dashboard
```

## Usage

```ts
import { DashboardServer, MetricsCollector } from '@tunnlo/dashboard';

const metrics = new MetricsCollector();
const dashboard = new DashboardServer({ port: 4400, metrics });

await dashboard.start();
// Dashboard available at http://localhost:4400
```

The dashboard is automatically enabled when using the CLI with a pipeline config. It runs on port 4400 by default.

## API

- **`DashboardServer`** -- HTTP server that serves the monitoring UI and metrics API
- **`MetricsCollector`** -- collects and exposes pipeline metrics

### Metric Types

- **`PipelineMetrics`** -- overall pipeline throughput and status
- **`AdapterMetrics`** -- per-adapter event counts and health
- **`FilterMetrics`** -- per-filter pass/drop/buffer statistics
- **`RecentEvent`** -- recent event log entries
- **`ErrorEntry`** -- recent error records
- **`LlmResponseEntry`** -- recent LLM response records

## License

MIT

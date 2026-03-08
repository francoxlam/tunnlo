# @tunnlo/actions

Action dispatch handlers for Tunnlo pipelines.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/actions
```

## Usage

```ts
import { WebhookAction } from '@tunnlo/actions';

const webhook = new WebhookAction({
  url: 'https://hooks.slack.com/services/...',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});

const result = await webhook.execute({
  type: 'webhook',
  config: {},
  payload: { message: 'Alert: anomaly detected' },
});
```

## API

- **`WebhookAction`** -- sends HTTP requests to external endpoints (Slack, PagerDuty, etc.)
- **`ApprovalGateAction`** -- requires human approval before executing downstream actions
- **`McpToolAction`** -- invokes tools on an MCP-compatible server

## License

MIT

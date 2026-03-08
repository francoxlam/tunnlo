# @tunnlo/filters

Filter and throttle engine for Tunnlo pipelines.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/filters
```

## Usage

```ts
import { RateLimiterFilter, ContentFilter, DedupFilter } from '@tunnlo/filters';

// Allow at most 30 events per minute
const rateLimiter = new RateLimiterFilter({ max_events_per_minute: 30 });

// Only pass events matching specific patterns
const contentFilter = new ContentFilter({
  rules: [{ field: 'payload.level', pattern: 'error|warn', action: 'include' }],
});

// Deduplicate events within a 10-second window
const dedup = new DedupFilter({
  window_seconds: 10,
  key_fields: ['payload.message'],
});
```

## API

- **`RateLimiterFilter`** -- limits event throughput to a configurable rate
- **`ContentFilter`** -- includes or excludes events based on field-matching rules
- **`DedupFilter`** -- drops duplicate events within a sliding time window
- **`WindowedAggregationFilter`** -- buffers events and emits aggregated summaries per time window
- **`AdaptiveSamplingFilter`** -- dynamically adjusts sampling rate based on event volume
- **`PriorityRouterFilter`** -- routes events to different processing paths by priority level

## License

MIT

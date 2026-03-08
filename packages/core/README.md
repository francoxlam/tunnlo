# @tunnlo/core

Core types, interfaces, and runtime for Tunnlo pipelines.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/core
```

## Usage

```ts
import { Pipeline, InMemoryBus, createEvent } from '@tunnlo/core';

// Create a message bus
const bus = new InMemoryBus();

// Build a pipeline
const pipeline = new Pipeline({ bus });
await pipeline.start();

// Create and publish events
const event = createEvent('network', { src_ip: '10.0.0.1' });
await bus.publish('events', event);
```

## API

### Pipeline & Bus

- **`Pipeline`** -- orchestrates adapters, filters, bridges, and actions into a processing pipeline
- **`InMemoryBus`** -- in-process message bus (default)
- **`RedisStreamsBus`** -- Redis Streams-backed distributed message bus
- **`KafkaBus`** -- Kafka-backed message bus
- **`FastBus`** -- high-throughput in-memory bus

### Events & State

- **`createEvent(type, payload)`** -- creates a `TunnloEvent` with a unique ID and timestamp
- **`eventKey(event)`** -- generates a deduplication key for an event
- **`validateEvent(event)`** -- validates event structure
- **`JsonFileStateStore`** -- file-based cursor/state persistence

### Logging

- **`getLogger(name)`** -- returns a named logger instance
- **`setGlobalLogger(logger)`** -- sets the global logger

### Types

- **`TunnloEvent`**, **`Adapter`**, **`Filter`**, **`AgentBridge`**, **`ActionHandler`** -- core interfaces
- **`PipelineConfig`**, **`AdapterConfig`**, **`FilterConfig`**, **`AgentConfig`** -- configuration types

## License

MIT

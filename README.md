<p align="center">
  <img src="https://tunnlo.com/img/logo.svg" alt="Tunnlo" width="120" />
</p>

<h1 align="center">Tunnlo</h1>

<p align="center">
  Pipe any live data stream into an LLM and act on it — in real time.
</p>

<p align="center">
  <a href="https://github.com/francoxlam/tunnlo/actions/workflows/ci.yml"><img src="https://github.com/francoxlam/tunnlo/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node.js" /></a>
</p>

<p align="center">
  <a href="https://tunnlo.com">Website</a> · <a href="https://tunnlo.com/docs/">Documentation</a> · <a href="https://tunnlo.com/getting-started/">Getting Started</a>
</p>

---
### Prerequisites

- **Node.js >= 22**
- An LLM provider:
  - [Ollama](https://ollama.com) for local models (recommended for getting started)
  - OpenAI, Anthropic, or any OpenAI-compatible API

## Try It Now

One command. No config. No API keys.

```bash
npx @tunnlo/cli demo
```

This streams your machine's live system logs + stdin through a local LLM ([Ollama](https://ollama.com)), with AI analysis appearing token-by-token in your terminal:

```
▶ logs  kernel: IOSurface
Routine kernel surface allocation — graphics subsystem managing shared
memory buffers between apps and the GPU. Normal operation.

▶ stdin  Error: ECONNREFUSED 127.0.0.1:5432
Connection refused to PostgreSQL on localhost. The database server isn't
running. Start it with `brew services start postgresql`.
```

Paste a stack trace, error message, JSON blob, or any text — get instant streaming analysis. A live dashboard runs at `http://localhost:4400` showing events, token usage, and latency in real time.

```bash
# Options
tunnlo demo --model mistral:7b   # pick a specific model
tunnlo demo --no-logs             # stdin only, no log tailing
```

> **Requirements:** [Ollama](https://ollama.com) running locally with any model pulled (`ollama pull llama3.1:8b`).

---

## What Is Tunnlo?

A real-time data-to-agent bridge. Pipe any data source — logs, network traffic, stdin, Kafka, MCP servers — through intelligent filters into any LLM, and act on its responses. Self-hosted, privacy-first, fully open source.

```
Data Sources → Message Bus → Filter Engine → Agent Bridge → Action Dispatch
```

1. **Adapters** ingest data from log files, network traffic, stdin, Kafka, Google Docs, MCP servers, or custom sources
2. **Filters** reduce noise — rate limiting, dedup, content matching, windowed aggregation, adaptive sampling, priority routing
3. **Agent Bridge** streams filtered events to an LLM with your system prompt
4. **Actions** execute based on LLM responses — webhooks, MCP tool calls, approval gates

## Quick Start

```bash
npm create tunnlo my-pipeline
cd my-pipeline
npm start
```

Or run directly with a config file:

```bash
tunnlo start pipeline.yaml
```

## Example Config

```yaml
sources:
  - id: app-logs
    adapter: native/log-tailer
    config:
      file_path: /var/log/app.log

filters:
  - type: content-filter
    rules:
      - field: payload.data
        regex: "(ERROR|WARN|CRITICAL)"

  - type: rate-limiter
    max_events_per_minute: 15

agent:
  runtime: direct-llm
  model: ollama/llama3.1:8b
  system_prompt: |
    You are a log analysis agent. For each log entry:
    1. Assess severity and likely root cause
    2. Recommend remediation steps
    Be concise and actionable.
  token_budget:
    max_per_hour: 50000

behavior:
  on_llm_unreachable: drop_and_alert
```

## Features

- **Streaming responses** — LLM output appears token-by-token in terminal and dashboard
- **Multi-LLM support** — Anthropic, OpenAI, Ollama, LangGraph, CrewAI, OpenClaw
- **Multi-agent routing** — route sources to specialized agents, fan-out for correlation
- **Intelligent filtering** — rate limiting, dedup, content matching, windowed aggregation, adaptive sampling, priority routing
- **Built-in adapters** — stdin, log-tailer, tshark, Kafka, Google Docs, MCP bridge
- **Custom adapter SDK** — push and polling base classes with test harness
- **Web dashboard** — live metrics, token usage, adapter status, agent responses (port 4400)
- **LLM benchmarking** — compare latency, throughput, and cost across providers
- **Hot reload** — send SIGHUP to reload config without restarting
- **Privacy-first** — self-hosted, your data never leaves your infrastructure

## CLI

```bash
tunnlo demo                     # Zero-config live demo with Ollama
tunnlo start <config>           # Start a pipeline from YAML config
tunnlo validate <config>        # Validate config without running
tunnlo status                   # Show dashboard metrics
tunnlo bench <config>           # Benchmark LLM bridges
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate config without starting |
| `--no-dashboard` | Disable the web dashboard |
| `--dashboard-port <port>` | Dashboard port (default: 4400) |
| `--log-level <level>` | `debug`, `info`, `warn`, `error`, `quiet` |
| `-q, --quiet` | Suppress all output except errors |
| `--log-file <path>` | Write logs to a file |

## Packages

| Package | Description |
|---------|-------------|
| `@tunnlo/core` | Types, pipeline, bus, event model, logger |
| `@tunnlo/adapters` | Built-in adapters: stdin, log-tailer, tshark, Kafka, Google Docs, MCP bridge |
| `@tunnlo/filters` | Filters: rate-limiter, dedup, content-filter, windowed, adaptive, priority |
| `@tunnlo/bridge-llm` | LLM bridges: Anthropic, OpenAI, Ollama, LangGraph, CrewAI, OpenClaw |
| `@tunnlo/actions` | Action handlers: webhook, MCP tool, approval gate |
| `@tunnlo/adapter-sdk` | SDK for building custom adapters |
| `@tunnlo/dashboard` | Web dashboard with live metrics |
| `@tunnlo/cli` | CLI entry point |
| `create-tunnlo` | Project scaffolding (`npm create tunnlo`) |

## Development

```bash
npm install          # Install dependencies
npm run build        # Build all packages
npx vitest run       # Run tests (166 tests)
npx vitest           # Watch mode
```

## Documentation

For full documentation, configuration reference, and guides, visit **[tunnlo.com](https://tunnlo.com)**.

## License

MIT

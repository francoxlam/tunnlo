# create-tunnlo

Scaffolding tool for new Tunnlo projects.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Usage

```bash
npm create tunnlo@latest
```

Or with a project name:

```bash
npm create tunnlo@latest my-pipeline
```

The interactive wizard will guide you through:

1. **Data source selection** -- stdin, tshark (network traffic), log file, or MCP bridge
2. **LLM / agent runtime** -- Anthropic Claude, OpenAI GPT-4o, Ollama (local), OpenClaw, LangGraph, or CrewAI

It generates a ready-to-run project with:

- `tunnlo.yaml` -- pipeline configuration
- `package.json` -- with all required Tunnlo dependencies
- `.env.example` -- API key template (when applicable)
- `.gitignore`

## Getting Started

```bash
npm create tunnlo@latest my-pipeline
cd my-pipeline
npm install
npm start
```

## License

MIT

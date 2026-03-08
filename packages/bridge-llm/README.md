# @tunnlo/bridge-llm

LLM and agent framework bridges for Tunnlo pipelines.

Part of the [Tunnlo](https://tunnlo.com) project -- a real-time data-to-agent bridge with intelligent filtering.

## Installation

```bash
npm install @tunnlo/bridge-llm
```

## Usage

```ts
import { AnthropicBridge } from '@tunnlo/bridge-llm';

const bridge = new AnthropicBridge({
  model: 'anthropic/claude-sonnet-4-5',
  system_prompt: 'You are a monitoring agent. Analyze incoming events.',
  token_budget: { max_per_hour: 50000, max_per_event: 4000 },
});

const response = await bridge.send(event);
console.log(response.text);
```

## API

### Direct LLM Bridges

- **`AnthropicBridge`** -- connects to Anthropic's Claude API
- **`OpenAIBridge`** -- connects to OpenAI's API (GPT-4o, etc.)
- **`OllamaBridge`** -- connects to a local Ollama instance

### Agent Framework Bridges

- **`OpenClawBridge`** -- WebSocket bridge to an OpenClaw agent gateway
- **`LangGraphBridge`** -- bridge to LangChain's LangGraph agent graphs
- **`CrewAIBridge`** -- bridge to CrewAI multi-agent framework

### Base Class

- **`BaseLLMBridge`** -- abstract base class for implementing custom bridges

## License

MIT

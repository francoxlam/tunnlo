import { platform } from 'node:os';
import { Pipeline, InMemoryBus, Logger, setGlobalLogger, getLogger } from '@tunnlo/core';
import type { AgentEntry, StreamChunkHandler } from '@tunnlo/core';
import { StdinAdapter } from '@tunnlo/adapters';
import { RateLimiterFilter, DedupFilter } from '@tunnlo/filters';
import { OllamaBridge } from '@tunnlo/bridge-llm';
import { MetricsCollector, DashboardServer } from '@tunnlo/dashboard';
import { LogStreamAdapter } from './log-stream-adapter.js';

export interface DemoOptions {
  model?: string;
  noLogs?: boolean;
}

const SYSTEM_PROMPT = `You are a real-time system analyst running inside Tunnlo, a data-to-agent pipeline.

You receive events from two sources:
- **system-logs**: live log lines from this machine's system log
- **stdin**: text the user pastes or types directly

For each event, give a brief, useful analysis:
- For log lines: explain what happened, flag anything unusual, note patterns if you see repeated entries
- For user input: analyze whatever they paste — stack traces, error messages, JSON, CSV, URLs, config files, or plain text
- Be concise: 2-4 sentences unless the input is complex
- If something looks like an error or security concern, lead with that
- Skip boilerplate log lines (routine heartbeats, scheduled tasks) with a single sentence

Never refuse to analyze. Never ask clarifying questions. Just analyze what you see.`;

function getLogStreamLabel(): string {
  const os = platform();
  if (os === 'darwin') return 'log stream (macOS unified log)';
  if (os === 'linux') return 'journalctl -f';
  return 'system logs';
}

async function checkOllama(baseUrl: string): Promise<{ running: boolean; model?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { running: false };
    const data = await res.json() as any;
    const models: string[] = (data.models ?? []).map((m: any) => m.name);
    return { running: true, model: models[0] };
  } catch {
    return { running: false };
  }
}

function createStreamHandler(): StreamChunkHandler {
  let active = false;

  return (_agentId, event, chunk) => {
    if (chunk.type === 'text' && chunk.text) {
      if (!active) {
        active = true;
        // Print source label
        const sourceLabel = event.source_id === 'stdin'
          ? '\x1b[33m▶ stdin\x1b[0m'
          : '\x1b[36m▶ logs\x1b[0m';
        const preview = (event.payload?.data ?? '').toString().slice(0, 80).replace(/\n/g, ' ');
        process.stdout.write(`\n${sourceLabel} ${'\x1b[2m'}${preview}${'\x1b[0m'}\n`);
      }
      process.stdout.write(chunk.text);
    } else if (chunk.type === 'done') {
      if (active) {
        process.stdout.write('\n');
        active = false;
      }
    }
  };
}

export async function runDemo(options: DemoOptions = {}): Promise<void> {
  setGlobalLogger(new Logger({ level: 'error' }));
  const log = getLogger();

  const baseUrl = 'http://localhost:11434';

  // 1. Check Ollama
  const ollamaCheck = await checkOllama(baseUrl);
  if (!ollamaCheck.running) {
    console.error('\x1b[31m[tunnlo demo] Ollama is not running.\x1b[0m');
    console.error('');
    console.error('  Install and start Ollama:');
    console.error('    1. Install from https://ollama.com');
    console.error('    2. Run: ollama serve');
    console.error('    3. Pull a model: ollama pull llama3.1:8b');
    console.error('    4. Re-run: tunnlo demo');
    console.error('');
    process.exit(1);
  }

  // 2. Determine model
  let model = options.model ?? 'llama3.1:8b';
  if (!options.model && ollamaCheck.model) {
    // Use whatever model is available
    model = ollamaCheck.model;
  }

  // 3. Build pipeline programmatically
  const bus = new InMemoryBus();

  // Adapters
  const adapters = new Map<string, any>();

  const stdinAdapter = new StdinAdapter();
  await stdinAdapter.connect({
    id: 'stdin',
    adapter: 'native/stdin',
    config: {},
  });
  adapters.set('stdin', stdinAdapter);

  let logLabel = '';
  if (!options.noLogs) {
    const logAdapter = new LogStreamAdapter();
    await logAdapter.connect({
      id: 'system-logs',
      adapter: 'log-stream',
      config: {},
    });
    adapters.set('system-logs', logAdapter);
    logLabel = getLogStreamLabel();
  }

  // Filters
  const filters = [
    new DedupFilter({ window_seconds: 10, key_fields: ['payload.data'] }),
    new RateLimiterFilter({ max_events_per_minute: 20 }),
  ];

  // Bridge
  const bridge = new OllamaBridge({ model, base_url: baseUrl });

  const agents: AgentEntry[] = [{
    id: 'analyst',
    bridge,
    config: {
      runtime: 'direct-llm',
      model: `ollama/${model}`,
      system_prompt: SYSTEM_PROMPT,
    },
  }];

  const onStreamChunk = createStreamHandler();
  const metrics = new MetricsCollector();

  const pipeline = new Pipeline({
    bus,
    adapters,
    filters,
    agents,
    actionHandlers: [],
    behavior: { on_llm_unreachable: 'drop_and_alert' },
    onStreamChunk,
    metrics,
  });

  // 5. Dashboard
  const dashPort = 4400;
  const dashboard = new DashboardServer(metrics, { port: dashPort });
  await dashboard.start();

  // 6. Banner
  console.log('');
  console.log('  \x1b[1m\x1b[36m┌─────────────────────────────────────────────┐\x1b[0m');
  console.log('  \x1b[1m\x1b[36m│\x1b[0m  \x1b[1mTunnlo Demo\x1b[0m — live AI analysis            \x1b[1m\x1b[36m│\x1b[0m');
  console.log('  \x1b[1m\x1b[36m│\x1b[0m                                             \x1b[1m\x1b[36m│\x1b[0m');
  console.log(`  \x1b[1m\x1b[36m│\x1b[0m  Model:  ${(`ollama/${model}`).slice(0, 35).padEnd(35)}\x1b[1m\x1b[36m│\x1b[0m`);
  if (logLabel) {
    console.log(`  \x1b[1m\x1b[36m│\x1b[0m  Logs:   ${logLabel.slice(0, 35).padEnd(35)}\x1b[1m\x1b[36m│\x1b[0m`);
  } else {
    console.log('  \x1b[1m\x1b[36m│\x1b[0m  Logs:   (disabled)                          \x1b[1m\x1b[36m│\x1b[0m');
  }
  console.log(`  \x1b[1m\x1b[36m│\x1b[0m  Dashboard: \x1b[4mhttp://localhost:${String(dashPort).padEnd(21)}\x1b[0m \x1b[1m\x1b[36m│\x1b[0m`);
  console.log('  \x1b[1m\x1b[36m│\x1b[0m                                             \x1b[1m\x1b[36m│\x1b[0m');
  console.log('  \x1b[1m\x1b[36m│\x1b[0m  Paste a stack trace, error, log line, JSON, \x1b[1m\x1b[36m│\x1b[0m');
  console.log('  \x1b[1m\x1b[36m│\x1b[0m  or any text — AI analyzes it in real time.  \x1b[1m\x1b[36m│\x1b[0m');
  console.log('  \x1b[1m\x1b[36m│\x1b[0m                                             \x1b[1m\x1b[36m│\x1b[0m');
  console.log('  \x1b[1m\x1b[36m│\x1b[0m  Press Ctrl+C to stop.                      \x1b[1m\x1b[36m│\x1b[0m');
  console.log('  \x1b[1m\x1b[36m└─────────────────────────────────────────────┘\x1b[0m');
  console.log('');

  // 6. Start
  const pipelineReady = pipeline.start();
  pipelineReady.catch((err) => {
    log.error('[tunnlo demo] Pipeline error:', err);
  });

  // 7. Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n\x1b[2m[tunnlo demo] Shutting down...\x1b[0m');
    await dashboard.stop();
    await pipeline.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

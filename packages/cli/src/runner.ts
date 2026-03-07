import type { PipelineConfig, LogLevel, LogFormat } from '@tunnlo/core';
import { Pipeline, Logger, setGlobalLogger, getLogger } from '@tunnlo/core';
import { MetricsCollector, DashboardServer } from '@tunnlo/dashboard';
import { createAdapter, createFilter, createBridge, createActionHandler, createBus } from './factory.js';

export interface RunResult {
  pipeline: Pipeline;
  dashboard?: DashboardServer;
  metrics: MetricsCollector;
  pipelineReady: Promise<void>;
}

export interface RunOptions {
  logLevel?: LogLevel;
  logFile?: string;
  logFormat?: LogFormat;
}

export async function buildAndRun(config: PipelineConfig, options: RunOptions = {}): Promise<RunResult> {
  const logLevel = options.logLevel ?? config.behavior?.log_level ?? 'info';
  const logFile = options.logFile ?? config.output?.log_file;
  const logFormat = options.logFormat ?? config.output?.log_format ?? 'text';
  setGlobalLogger(new Logger({ level: logLevel, logFile, format: logFormat }));

  const bus = await createBus(config.bus);
  const metrics = new MetricsCollector();

  // Create adapters — track for cleanup on failure
  const adapters = new Map<string, ReturnType<typeof createAdapter>>();
  try {
    for (const sourceConfig of config.sources) {
      const adapter = createAdapter(sourceConfig);
      await adapter.connect(sourceConfig);
      adapters.set(sourceConfig.id, adapter);
    }

    // Create filters
    const filters = config.filters.map(createFilter);

    // Create bridge
    const bridge = createBridge(config.agent);

    // Create action handlers
    const actionHandlers = (config.agent.actions ?? []).map(createActionHandler);

    const pipeline = new Pipeline({
      bus,
      adapters,
      filters,
      bridge,
      agentConfig: config.agent,
      actionHandlers,
      behavior: config.behavior,
      metrics,
    });

    // Start dashboard if configured
    let dashboard: DashboardServer | undefined;
    if (config.dashboard?.enabled !== false) {
      dashboard = new DashboardServer(metrics, {
        port: config.dashboard?.port,
        host: config.dashboard?.host,
      });
      dashboard.setPipelineConfig(config);
      await dashboard.start();
    }

    // Start pipeline in the background — pipeline.start() blocks until
    // all adapters finish (stdin never finishes), so we don't await it.
    const pipelineReady = pipeline.start();
    pipelineReady.catch((err) => {
      getLogger().error('[tunnlo] Pipeline error:', err);
    });

    return { pipeline, dashboard, metrics, pipelineReady };
  } catch (err) {
    // Clean up already-connected resources on startup failure
    for (const [, adapter] of adapters) {
      try { await adapter.disconnect(); } catch { /* best effort */ }
    }
    try { await bus.close(); } catch { /* best effort */ }
    throw err;
  }
}

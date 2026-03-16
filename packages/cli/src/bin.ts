#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { buildAndRun } from './runner.js';
import { runBench } from './bench.js';
import { runDemo } from './demo.js';
import type { LogLevel, LogFormat } from '@tunnlo/core';
import { getLogger, Logger, setGlobalLogger } from '@tunnlo/core';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'quiet'] as const;
const LOG_FORMATS = ['text', 'json'] as const;

const program = new Command();

program
  .name('tunnlo')
  .description('Real-time data-to-agent bridge with intelligent filtering')
  .version('0.1.0');

program
  .command('start')
  .description('Start a Tunnlo pipeline from a config file')
  .argument('<config>', 'Path to YAML config file')
  .option('--dry-run', 'Validate config without starting the pipeline')
  .option('--no-dashboard', 'Disable the web dashboard')
  .option('--dashboard-port <port>', 'Dashboard port (default: 4400)')
  .option('--log-level <level>', `Log level: ${LOG_LEVELS.join(', ')} (default: info)`)
  .option('-q, --quiet', 'Suppress all output except errors')
  .option('--log-file <path>', 'Write logs to a file')
  .option('--log-format <format>', `Log format: ${LOG_FORMATS.join(', ')} (default: text)`)
  .action(async (configPath: string, options: {
    dryRun?: boolean;
    dashboard?: boolean;
    dashboardPort?: string;
    logLevel?: string;
    quiet?: boolean;
    logFile?: string;
    logFormat?: string;
  }) => {
    try {
      const config = await loadConfig(configPath);

      if (options.dryRun) {
        console.log('[tunnlo] Config is valid.');
        console.log(`  Sources: ${config.sources.map((s) => s.id).join(', ')}`);
        console.log(`  Filters: ${config.filters.length > 0 ? config.filters.map((f) => f.type).join(', ') : '(none)'}`);
        const agentsList = config.agents ?? [];
        console.log(`  Agents: ${agentsList.map((a) => `${a.id ?? 'default'} (${a.model})`).join(', ')}`);
        return;
      }

      if (options.dashboard === false) {
        config.dashboard = { enabled: false };
      } else if (options.dashboardPort) {
        const port = parseInt(options.dashboardPort, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          throw new Error(`Invalid dashboard port: ${options.dashboardPort}. Must be between 1 and 65535.`);
        }
        config.dashboard = { ...config.dashboard, port };
      }

      // Resolve log level: CLI flag > config > default
      let logLevel: LogLevel = 'info';
      if (options.quiet) {
        logLevel = 'error';
      } else if (options.logLevel) {
        if (!LOG_LEVELS.includes(options.logLevel as any)) {
          throw new Error(`Invalid log level: "${options.logLevel}". Must be one of: ${LOG_LEVELS.join(', ')}`);
        }
        logLevel = options.logLevel as LogLevel;
      } else if (config.behavior?.log_level) {
        logLevel = config.behavior.log_level;
      }

      const logFile = options.logFile ?? config.output?.log_file;

      let logFormat: LogFormat = 'text';
      if (options.logFormat) {
        if (!LOG_FORMATS.includes(options.logFormat as any)) {
          throw new Error(`Invalid log format: "${options.logFormat}". Must be one of: ${LOG_FORMATS.join(', ')}`);
        }
        logFormat = options.logFormat as LogFormat;
      } else if (config.output?.log_format) {
        logFormat = config.output.log_format;
      }

      const log = getLogger();
      log.always('[tunnlo] Starting pipeline...');
      const { pipeline, dashboard } = await buildAndRun(config, { logLevel, logFile, logFormat });

      let shuttingDown = false;
      const shutdown = async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        log.always('\n[tunnlo] Shutting down...');
        if (dashboard) await dashboard.stop();
        await pipeline.stop();
        await getLogger().close();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // SIGHUP — reload config (log level, format, token budget, filters)
      process.on('SIGHUP', async () => {
        try {
          const reloaded = await loadConfig(configPath);
          const newLevel = reloaded.behavior?.log_level ?? logLevel;
          const newFormat = reloaded.output?.log_format ?? logFormat;
          const newLogFile = reloaded.output?.log_file ?? logFile;

          // Recreate logger with potentially new settings
          await getLogger().close();
          setGlobalLogger(new Logger({ level: newLevel, logFile: newLogFile, format: newFormat }));
          getLogger().always('[tunnlo] Config reloaded via SIGHUP');

          // Update dashboard config display
          if (dashboard) {
            dashboard.setPipelineConfig(reloaded);
          }
        } catch (err) {
          getLogger().error('[tunnlo] Config reload failed:', err);
        }
      });

      // Startup banner — always shown unless --quiet
      const hasStdin = config.sources.some((s) => s.adapter === 'native/stdin');
      const dashPort = config.dashboard?.port ?? 4400;
      const dashEnabled = config.dashboard?.enabled !== false && options.dashboard !== false;

      log.always('');
      log.always('  ┌─────────────────────────────────────────────┐');
      log.always('  │  Tunnlo pipeline running                    │');
      log.always('  │                                             │');
      log.always(`  │  Sources:  ${config.sources.map((s) => s.id).join(', ').slice(0, 33).padEnd(33)}│`);
      log.always(`  │  Filters:  ${(config.filters.length > 0 ? config.filters.map((f) => f.type).join(', ') : '(none)').slice(0, 33).padEnd(33)}│`);
      const agentsSummary = (config.agents ?? []).map((a) => a.id ?? 'default').join(', ');
      log.always(`  │  Agents:  ${agentsSummary.slice(0, 34).padEnd(34)}│`);
      if (dashEnabled) {
        log.always(`  │  Dashboard: http://localhost:${String(dashPort).padEnd(22)}│`);
      }
      log.always(`  │  Log level: ${logLevel.padEnd(32)}│`);
      if (logFile) {
        log.always(`  │  Log file: ${logFile.slice(0, 33).padEnd(33)}│`);
      }
      log.always('  │                                             │');
      if (hasStdin) {
        log.always('  │  Type a message below and press Enter to    │');
        log.always('  │  send it through the pipeline.              │');
      }
      log.always('  │  Press Ctrl+C to stop.                      │');
      log.always('  └─────────────────────────────────────────────┘');
      log.always('');
      if (hasStdin) {
        log.always('[tunnlo] Waiting for input...');
        log.always('');
      }
    } catch (err) {
      console.error('[tunnlo] Error:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate a config file without running')
  .argument('<config>', 'Path to YAML config file')
  .action(async (configPath: string) => {
    try {
      const config = await loadConfig(configPath);
      console.log('[tunnlo] Config is valid.');
      console.log(`  Sources: ${config.sources.length}`);
      console.log(`  Filters: ${config.filters.length}`);
      const agents = config.agents ?? [];
      console.log(`  Agents: ${agents.length}`);
      for (const a of agents) {
        console.log(`    - ${a.id ?? 'default'}: ${a.runtime} / ${a.model}${a.sources ? ` (sources: ${a.sources.join(', ')})` : ' (all sources)'}`);
      }
    } catch (err) {
      console.error('[tunnlo] Invalid config:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show pipeline status from running dashboard')
  .option('--port <port>', 'Dashboard port (default: 4400)')
  .action(async (options: { port?: string }) => {
    const port = options.port ?? '4400';
    try {
      const res = await fetch(`http://localhost:${port}/api/metrics`);
      if (!res.ok) {
        throw new Error(`Dashboard returned HTTP ${res.status}`);
      }
      const metrics = await res.json() as any;
      console.log('[tunnlo] Pipeline Status');
      console.log(`  Uptime: ${Math.floor(metrics.uptime_seconds / 60)}m ${metrics.uptime_seconds % 60}s`);
      console.log(`  Events received: ${metrics.events_received}`);
      console.log(`  Events sent to LLM: ${metrics.events_sent_to_llm}`);
      console.log(`  Events filtered: ${metrics.events_filtered}`);
      console.log(`  Events dropped: ${metrics.events_dropped}`);
      console.log(`  Events/sec: ${metrics.events_per_second}`);
      console.log(`  Tokens (this hour): ${metrics.tokens_used_this_hour}`);
      console.log(`  Tokens (total): ${metrics.tokens_used_total}`);
      console.log(`  Avg latency: ${metrics.avg_latency_ms}ms`);
      console.log(`  Adapters: ${metrics.adapters.map((a: any) => `${a.id} (${a.status})`).join(', ')}`);
      console.log(`  Dashboard: http://localhost:${port}`);
    } catch {
      console.error(`[tunnlo] Could not connect to dashboard on port ${port}.`);
      console.error('  Make sure a pipeline is running with "tunnlo start <config>".');
      process.exit(1);
    }
  });

program
  .command('demo')
  .description('Zero-config live demo: streams system logs + stdin through a local LLM')
  .option('--model <model>', 'Ollama model to use (default: llama3.1:8b)')
  .option('--no-logs', 'Disable log streaming, stdin only')
  .action(async (options: { model?: string; logs?: boolean }) => {
    try {
      await runDemo({
        model: options.model,
        noLogs: options.logs === false,
      });
    } catch (err) {
      console.error('[tunnlo demo] Error:', (err as Error).message);
      process.exit(1);
    }
  });

program
  .command('bench')
  .description('Benchmark LLM bridges: compare latency, throughput, and token usage')
  .argument('<config>', 'Path to benchmark YAML config file')
  .option('--json', 'Output results as JSON')
  .action(async (configPath: string, options: { json?: boolean }) => {
    try {
      await runBench(configPath, options);
    } catch (err) {
      console.error('[tunnlo bench] Error:', (err as Error).message);
      process.exit(1);
    }
  });

program.parse();

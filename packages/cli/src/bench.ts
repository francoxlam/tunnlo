import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { randomUUID } from 'node:crypto';
import { interpolateEnv } from './config.js';
import { createBridge } from './factory.js';
import type { TunnloEvent, AgentConfig } from '@tunnlo/core';
import {
  BenchmarkRunner,
  formatReport,
  type BridgeSpec,
  type BenchmarkReport,
} from '@tunnlo/bridge-llm';

// ── Bench config schema ─────────────────────────────────────────────────

interface BenchYaml {
  system_prompt: string;
  iterations?: number;
  warmup?: number;
  events?: Array<Record<string, any>>;
  bridges: Array<{
    provider: string;
    model: string;
    base_url?: string;
    api_key?: string;
    // Agent-framework bridges
    runtime?: string;
    gateway_url?: string;
    agent_id?: string;
    endpoint_url?: string;
    graph_id?: string;
    crew_id?: string;
  }>;
}

export async function loadBenchConfig(configPath: string): Promise<BenchYaml> {
  const raw = await readFile(configPath, 'utf-8');
  const interpolated = interpolateEnv(raw);
  const parsed = parseYaml(interpolated) as BenchYaml;

  if (!parsed.system_prompt) {
    throw new Error('Bench config must include system_prompt');
  }
  if (!parsed.bridges || !Array.isArray(parsed.bridges) || parsed.bridges.length === 0) {
    throw new Error('Bench config must include at least one bridge');
  }
  for (const b of parsed.bridges) {
    if (!b.model) throw new Error('Each bridge must specify a model');
  }
  return parsed;
}

function buildEvents(config: BenchYaml): TunnloEvent[] {
  if (config.events && config.events.length > 0) {
    return config.events.map((e, i) => ({
      event_id: e.event_id ?? randomUUID(),
      source_id: e.source_id ?? 'bench',
      timestamp: e.timestamp ?? new Date().toISOString(),
      event_type: e.event_type ?? 'DATA',
      priority: e.priority,
      payload: e.payload ?? e,
      metadata: e.metadata,
    }));
  }
  // Default: a single synthetic event
  return [
    {
      event_id: randomUUID(),
      source_id: 'bench',
      timestamp: new Date().toISOString(),
      event_type: 'DATA',
      payload: { message: 'Benchmark test event — please analyze and respond.' },
    },
  ];
}

function buildBridges(config: BenchYaml): BridgeSpec[] {
  return config.bridges.map((b) => {
    const runtime = b.runtime ?? 'direct-llm';
    const model = b.provider ? `${b.provider}/${b.model}` : b.model;
    const name = model;

    const agentConfig: AgentConfig = {
      runtime,
      model,
      system_prompt: config.system_prompt,
      ...(b.base_url && { base_url: b.base_url }),
      ...(b.api_key && { api_key: b.api_key }),
      ...(b.gateway_url && { gateway_url: b.gateway_url }),
      ...(b.agent_id && { agent_id: b.agent_id }),
      ...(b.endpoint_url && { endpoint_url: b.endpoint_url }),
      ...(b.graph_id && { graph_id: b.graph_id }),
      ...(b.crew_id && { crew_id: b.crew_id }),
    } as any;

    return { name, bridge: createBridge(agentConfig) };
  });
}

export async function runBench(
  configPath: string,
  options: { json?: boolean },
): Promise<void> {
  const config = await loadBenchConfig(configPath);
  const events = buildEvents(config);
  const bridges = buildBridges(config);

  console.log(`[tunnlo bench] ${bridges.length} bridge(s), ${events.length} event(s), ${config.iterations ?? 3} iterations, ${config.warmup ?? 1} warmup`);
  console.log('');

  const runner = new BenchmarkRunner({
    iterations: config.iterations,
    warmup: config.warmup,
    system_prompt: config.system_prompt,
  });

  const report: BenchmarkReport = await runner.run(
    bridges,
    events,
    (bridgeName, completed, total) => {
      const pct = Math.round((completed / total) * 100);
      process.stdout.write(`\r  [${bridgeName}] ${completed}/${total} (${pct}%)`);
    },
  );

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(60) + '\r');

  if (options.json) {
    // Strip full response content from JSON output (keep it lean)
    const lean = {
      ...report,
      results: report.results.map((r) => ({
        ...r,
        samples: r.samples.map(({ content, ...rest }) => rest),
      })),
    };
    console.log(JSON.stringify(lean, null, 2));
  } else {
    console.log(formatReport(report));
  }

  // Cleanup bridges
  for (const spec of bridges) {
    await spec.bridge.close();
  }
}

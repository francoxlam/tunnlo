import type { AgentBridge, AgentResponse, TunnloEvent } from '@tunnlo/core';

// ── Types ──────────────────────────────────────────────────────────────

export interface BenchmarkConfig {
  /** Number of measured iterations per bridge per event (default: 3) */
  iterations?: number;
  /** Warmup runs discarded before measurement (default: 1) */
  warmup?: number;
  /** System prompt sent with every request */
  system_prompt: string;
}

export interface BridgeSpec {
  /** Display name for this bridge in results (e.g. "ollama/llama3.1:8b") */
  name: string;
  bridge: AgentBridge;
}

export interface IterationResult {
  latency_ms: number;
  tokens_used: number;
  content: string;
  error?: string;
}

export interface BridgeBenchmarkResult {
  name: string;
  iterations: number;
  errors: number;
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
  avg_tokens_per_request: number;
  tokens_per_second: number;
  samples: IterationResult[];
}

export interface BenchmarkReport {
  timestamp: string;
  config: { iterations: number; warmup: number; events_count: number };
  results: BridgeBenchmarkResult[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Runner ──────────────────────────────────────────────────────────────

export class BenchmarkRunner {
  private config: Required<BenchmarkConfig>;

  constructor(config: BenchmarkConfig) {
    this.config = {
      iterations: config.iterations ?? 3,
      warmup: config.warmup ?? 1,
      system_prompt: config.system_prompt,
    };
  }

  /**
   * Run benchmark for a single bridge against a set of events.
   * Returns aggregated result across all events × iterations.
   */
  async runBridge(
    spec: BridgeSpec,
    events: TunnloEvent[],
    onProgress?: (completed: number, total: number) => void,
  ): Promise<BridgeBenchmarkResult> {
    const totalRuns = events.length * this.config.iterations;
    const samples: IterationResult[] = [];
    let errors = 0;
    let completed = 0;

    // Warmup
    for (let w = 0; w < this.config.warmup; w++) {
      for (const event of events) {
        try {
          await spec.bridge.send(event, this.config.system_prompt);
        } catch {
          // warmup errors are ignored
        }
      }
    }

    // Measured runs
    for (let i = 0; i < this.config.iterations; i++) {
      for (const event of events) {
        const start = performance.now();
        let result: IterationResult;
        try {
          const resp: AgentResponse = await spec.bridge.send(event, this.config.system_prompt);
          const latency = performance.now() - start;
          result = {
            latency_ms: Math.round(latency * 100) / 100,
            tokens_used: resp.tokens_used,
            content: resp.content,
          };
        } catch (err) {
          const latency = performance.now() - start;
          errors++;
          result = {
            latency_ms: Math.round(latency * 100) / 100,
            tokens_used: 0,
            content: '',
            error: (err as Error).message,
          };
        }
        samples.push(result);
        completed++;
        onProgress?.(completed, totalRuns);
      }
    }

    return this.aggregate(spec.name, samples, errors);
  }

  /**
   * Run benchmark across all bridges sequentially, returning a full report.
   */
  async run(
    bridges: BridgeSpec[],
    events: TunnloEvent[],
    onProgress?: (bridgeName: string, completed: number, total: number) => void,
  ): Promise<BenchmarkReport> {
    const results: BridgeBenchmarkResult[] = [];

    for (const spec of bridges) {
      const result = await this.runBridge(spec, events, (c, t) =>
        onProgress?.(spec.name, c, t),
      );
      results.push(result);
    }

    return {
      timestamp: new Date().toISOString(),
      config: {
        iterations: this.config.iterations,
        warmup: this.config.warmup,
        events_count: events.length,
      },
      results,
    };
  }

  private aggregate(
    name: string,
    samples: IterationResult[],
    errors: number,
  ): BridgeBenchmarkResult {
    const successful = samples.filter((s) => !s.error);
    const latencies = successful.map((s) => s.latency_ms).sort((a, b) => a - b);
    const totalTokens = successful.reduce((sum, s) => sum + s.tokens_used, 0);
    const totalTimeMs = successful.reduce((sum, s) => sum + s.latency_ms, 0);

    const avgLatency = latencies.length > 0
      ? Math.round((totalTimeMs / latencies.length) * 100) / 100
      : 0;

    return {
      name,
      iterations: samples.length,
      errors,
      avg_latency_ms: avgLatency,
      min_latency_ms: latencies.length > 0 ? latencies[0] : 0,
      max_latency_ms: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
      p50_latency_ms: percentile(latencies, 50),
      p95_latency_ms: percentile(latencies, 95),
      total_tokens: totalTokens,
      avg_tokens_per_request: successful.length > 0
        ? Math.round(totalTokens / successful.length)
        : 0,
      tokens_per_second: totalTimeMs > 0
        ? Math.round((totalTokens / (totalTimeMs / 1000)) * 100) / 100
        : 0,
      samples,
    };
  }
}

// ── Formatting ──────────────────────────────────────────────────────────

export function formatReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  const { results, config } = report;

  lines.push('');
  lines.push('  Tunnlo Benchmark Results');
  lines.push(`  ${config.events_count} event(s) × ${config.iterations} iterations, ${config.warmup} warmup`);
  lines.push('');

  // Table header
  const cols = [
    { label: 'Bridge', width: 30 },
    { label: 'Avg (ms)', width: 10 },
    { label: 'P50 (ms)', width: 10 },
    { label: 'P95 (ms)', width: 10 },
    { label: 'Min (ms)', width: 10 },
    { label: 'Max (ms)', width: 10 },
    { label: 'Tok/s', width: 10 },
    { label: 'Avg Tok', width: 10 },
    { label: 'Errs', width: 6 },
  ];

  const header = cols.map((c) => c.label.padEnd(c.width)).join('  ');
  const separator = cols.map((c) => '─'.repeat(c.width)).join('──');
  lines.push(`  ${header}`);
  lines.push(`  ${separator}`);

  // Sort by avg latency (fastest first); all-error bridges go last
  const sorted = [...results].sort((a, b) => {
    const aFailed = a.errors === a.iterations;
    const bFailed = b.errors === b.iterations;
    if (aFailed !== bFailed) return aFailed ? 1 : -1;
    return a.avg_latency_ms - b.avg_latency_ms;
  });

  for (const r of sorted) {
    const row = [
      r.name.slice(0, 30).padEnd(30),
      String(r.avg_latency_ms).padStart(10),
      String(r.p50_latency_ms).padStart(10),
      String(r.p95_latency_ms).padStart(10),
      String(r.min_latency_ms).padStart(10),
      String(r.max_latency_ms).padStart(10),
      String(r.tokens_per_second).padStart(10),
      String(r.avg_tokens_per_request).padStart(10),
      String(r.errors).padStart(6),
    ].join('  ');
    lines.push(`  ${row}`);
  }

  lines.push('');

  // Winner callout
  if (sorted.length > 1 && sorted[0].avg_latency_ms > 0) {
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    const speedup = slowest.avg_latency_ms > 0
      ? (slowest.avg_latency_ms / fastest.avg_latency_ms).toFixed(1)
      : '?';
    lines.push(`  Fastest: ${fastest.name} (${speedup}x faster than ${slowest.name})`);

    const highestTokSec = [...sorted].sort((a, b) => b.tokens_per_second - a.tokens_per_second)[0];
    if (highestTokSec.tokens_per_second > 0) {
      lines.push(`  Highest throughput: ${highestTokSec.name} (${highestTokSec.tokens_per_second} tok/s)`);
    }
    lines.push('');
  }

  // Error details
  const withErrors = results.filter((r) => r.errors > 0);
  if (withErrors.length > 0) {
    lines.push('  Errors');
    lines.push('  ' + '─'.repeat(60));
    for (const r of withErrors) {
      const firstError = r.samples.find((s) => s.error);
      lines.push(`  ${r.name}: ${r.errors}/${r.iterations} failed`);
      if (firstError?.error) {
        // Show first error, truncated to keep it readable
        const msg = firstError.error.length > 120
          ? firstError.error.slice(0, 120) + '...'
          : firstError.error;
        lines.push(`    ${msg}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

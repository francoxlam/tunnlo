import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { PipelineConfig } from '@tunnlo/core';

/**
 * Interpolate ${ENV_VAR} and ${ENV_VAR:-default} placeholders in a string.
 * Only top-level environment variable references are replaced; nested
 * expressions are not supported.
 */
export function interpolateEnv(text: string): string {
  return text.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const [name, ...rest] = expr.split(':-');
    const fallback = rest.length > 0 ? rest.join(':-') : undefined;
    const value = process.env[name.trim()];
    if (value !== undefined) return value;
    if (fallback !== undefined) return fallback;
    throw new Error(`Environment variable "${name.trim()}" is not set and has no default`);
  });
}

export async function loadConfig(configPath: string): Promise<PipelineConfig> {
  const raw = await readFile(configPath, 'utf-8');
  const interpolated = interpolateEnv(raw);
  const parsed = parseYaml(interpolated) as PipelineConfig;

  if (!parsed.sources || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error('Config must include at least one source');
  }

  if (!parsed.agent?.runtime) {
    throw new Error('Config must include agent.runtime');
  }

  if (!parsed.agent?.model) {
    throw new Error('Config must include agent.model');
  }

  if (!parsed.agent?.system_prompt) {
    throw new Error('Config must include agent.system_prompt');
  }

  if (parsed.filters !== undefined && !Array.isArray(parsed.filters)) {
    throw new Error('Config filters must be an array');
  }

  // Default to empty array if omitted
  if (!parsed.filters) {
    parsed.filters = [];
  }

  return parsed;
}

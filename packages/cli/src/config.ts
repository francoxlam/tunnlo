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

function validateAgentConfig(agent: any, label: string): void {
  if (!agent?.runtime) {
    throw new Error(`Config ${label} must include runtime`);
  }
  if (!agent?.model) {
    throw new Error(`Config ${label} must include model`);
  }
  if (!agent?.system_prompt) {
    throw new Error(`Config ${label} must include system_prompt`);
  }
  if (agent.sources !== undefined && !Array.isArray(agent.sources)) {
    throw new Error(`Config ${label}.sources must be an array of source IDs`);
  }
}

export async function loadConfig(configPath: string): Promise<PipelineConfig> {
  const raw = await readFile(configPath, 'utf-8');
  const interpolated = interpolateEnv(raw);
  const parsed = parseYaml(interpolated) as PipelineConfig;

  if (!parsed.sources || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
    throw new Error('Config must include at least one source');
  }

  if (parsed.agent && parsed.agents) {
    throw new Error('Config must use either `agent` (single) or `agents` (multiple), not both');
  }

  if (!parsed.agent && !parsed.agents) {
    throw new Error('Config must include `agent` or `agents`');
  }

  // Normalize singular `agent` into `agents` array
  if (parsed.agent) {
    validateAgentConfig(parsed.agent, 'agent');
    if (!parsed.agent.id) parsed.agent.id = 'default';
    parsed.agents = [parsed.agent];
    delete parsed.agent;
  } else {
    if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
      throw new Error('Config `agents` must be a non-empty array');
    }
    const ids = new Set<string>();
    for (let i = 0; i < parsed.agents.length; i++) {
      const a = parsed.agents[i];
      validateAgentConfig(a, `agents[${i}]`);
      if (!a.id) a.id = `agent-${i}`;
      if (ids.has(a.id)) {
        throw new Error(`Duplicate agent id: "${a.id}"`);
      }
      ids.add(a.id);
    }
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

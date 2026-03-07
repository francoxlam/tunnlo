import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { interpolateEnv } from './config.js';

describe('interpolateEnv', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.TUNNLO_TEST_KEY = 'secret-123';
    process.env.TUNNLO_TEST_MODEL = 'gpt-4o';
  });

  afterEach(() => {
    delete process.env.TUNNLO_TEST_KEY;
    delete process.env.TUNNLO_TEST_MODEL;
    Object.assign(process.env, saved);
  });

  it('replaces ${VAR} with env value', () => {
    expect(interpolateEnv('key: ${TUNNLO_TEST_KEY}')).toBe('key: secret-123');
  });

  it('replaces multiple variables', () => {
    const input = 'api_key: ${TUNNLO_TEST_KEY}\nmodel: ${TUNNLO_TEST_MODEL}';
    expect(interpolateEnv(input)).toBe('api_key: secret-123\nmodel: gpt-4o');
  });

  it('uses default value when env var is not set', () => {
    expect(interpolateEnv('host: ${MISSING_VAR:-localhost}')).toBe('host: localhost');
  });

  it('prefers env value over default', () => {
    expect(interpolateEnv('key: ${TUNNLO_TEST_KEY:-fallback}')).toBe('key: secret-123');
  });

  it('supports empty default', () => {
    expect(interpolateEnv('val: ${MISSING_VAR:-}')).toBe('val: ');
  });

  it('preserves :- in default value', () => {
    expect(interpolateEnv('val: ${MISSING_VAR:-a:-b}')).toBe('val: a:-b');
  });

  it('throws when env var is missing and no default', () => {
    expect(() => interpolateEnv('key: ${TOTALLY_MISSING}')).toThrow(
      'Environment variable "TOTALLY_MISSING" is not set and has no default',
    );
  });

  it('leaves text without placeholders unchanged', () => {
    const input = 'plain text without any variables';
    expect(interpolateEnv(input)).toBe(input);
  });
});

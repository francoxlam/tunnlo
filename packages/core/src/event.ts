import { randomUUID } from 'node:crypto';
import type { TunnloEvent, EventType } from './types.js';

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]']);

/**
 * Validates a URL is safe for outbound requests (blocks SSRF to internal networks).
 * Throws if the URL targets localhost, private IPs, or cloud metadata endpoints.
 */
export function validateOutboundUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL: only http/https protocols are allowed, got ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked URL: requests to ${hostname} are not allowed`);
  }

  // Block private/internal IP ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    const [a, b] = parts;
    if (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    ) {
      throw new Error(`Blocked URL: requests to private IP ${hostname} are not allowed`);
    }
  }
}

export function createEvent(
  source_id: string,
  event_type: EventType,
  payload: Record<string, any>,
  options?: {
    priority?: number;
    metadata?: Record<string, any>;
    raw?: string | Buffer;
  },
): TunnloEvent {
  return {
    event_id: randomUUID(),
    source_id,
    timestamp: new Date().toISOString(),
    event_type,
    priority: options?.priority ?? 3,
    payload,
    metadata: options?.metadata,
    raw: options?.raw,
  };
}

export function eventKey(event: TunnloEvent, fields: string[]): string {
  const parts = fields.map((field) => {
    const value = getNestedValue(event, field);
    return value !== undefined ? String(value) : '';
  });
  return parts.join('|');
}

const VALID_EVENT_TYPES = new Set(['DATA', 'ALERT', 'METRIC', 'HEARTBEAT', 'ERROR']);

/** Validates a parsed object has the required TunnloEvent fields. */
export function validateEvent(obj: unknown): obj is TunnloEvent {
  if (obj == null || typeof obj !== 'object') return false;
  const e = obj as Record<string, unknown>;
  return (
    typeof e.event_id === 'string' &&
    typeof e.source_id === 'string' &&
    typeof e.timestamp === 'string' &&
    typeof e.event_type === 'string' &&
    VALID_EVENT_TYPES.has(e.event_type) &&
    e.payload != null &&
    typeof e.payload === 'object'
  );
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    if (BLOCKED_KEYS.has(part)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

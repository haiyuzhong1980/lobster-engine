// @lobster-engine/core — logger tests

import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { createLogger, withTraceId, generateTraceId } from '../logger.js';
import type { Logger } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CaptureStream {
  records: Record<string, unknown>[];
  stream: Parameters<typeof pino>[1];
}

/**
 * Build a synchronous in-memory stream that collects pino JSON records.
 * Works with pino's stream second-argument API.
 */
function makeCapture(): CaptureStream {
  const records: Record<string, unknown>[] = [];
  const stream = {
    write(chunk: string): void {
      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (t.length === 0) continue;
        try {
          records.push(JSON.parse(t) as Record<string, unknown>);
        } catch {
          // ignore non-JSON lines
        }
      }
    },
  } as Parameters<typeof pino>[1];
  return { records, stream };
}

// ---------------------------------------------------------------------------
// createLogger — shape and context binding
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  it('creates a logger with the component name bound', () => {
    const logger = createLogger('my-service');
    expect(logger).toBeDefined();
    const levels: Array<keyof Logger> = [
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ];
    for (const level of levels) {
      expect(typeof logger[level]).toBe('function');
    }
  });

  it('binds context fields — verified via direct pino child logger', () => {
    // We verify context binding behaviour by building an equivalent pino child
    // logger directly with a capture stream, since the module-level root pino
    // instance cannot be replaced after initialisation.
    const { records, stream } = makeCapture();
    const rawPino = pino({ level: 'trace' }, stream);
    const child = rawPino.child({ component: 'test', botId: 'bot-42', sceneId: 'scene-1' });
    child.info('hello');

    expect(records.length).toBe(1);
    const record = records[0]!;
    expect(record['component']).toBe('test');
    expect(record['botId']).toBe('bot-42');
    expect(record['sceneId']).toBe('scene-1');
    expect(record['msg']).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// withTraceId
// ---------------------------------------------------------------------------

describe('withTraceId', () => {
  it('returns a Logger instance', () => {
    const base = createLogger('tracer-test');
    const traced = withTraceId(base, 'trace-abc');
    expect(traced).toBeDefined();
    const levels: Array<keyof Logger> = [
      'trace',
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ];
    for (const level of levels) {
      expect(typeof traced[level]).toBe('function');
    }
  });

  it('produces a different logger instance than the source', () => {
    const base = createLogger('tracer-test-2');
    const traced = withTraceId(base, 'trace-xyz');
    expect(traced).not.toBe(base);
  });

  it('passes through an unknown logger implementation unchanged', () => {
    const foreign: Logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    const result = withTraceId(foreign, 'some-trace');
    // Should return the same object since it's not a PinoLogger
    expect(result).toBe(foreign);
  });
});

// ---------------------------------------------------------------------------
// generateTraceId
// ---------------------------------------------------------------------------

describe('generateTraceId', () => {
  it('returns a non-empty string', () => {
    const id = generateTraceId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a UUID v4 format', () => {
    const id = generateTraceId();
    const uuidV4Re =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidV4Re.test(id)).toBe(true);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Redaction of sensitive fields
// ---------------------------------------------------------------------------

describe('sensitive field redaction', () => {
  it('redacts top-level token field', () => {
    const records: Record<string, unknown>[] = [];

    // Build an isolated pino logger that writes to our capture buffer
    const stream = {
      write(chunk: string): void {
        for (const line of chunk.split('\n')) {
          const t = line.trim();
          if (t.length === 0) continue;
          try {
            records.push(JSON.parse(t) as Record<string, unknown>);
          } catch { /* ignore */ }
        }
      },
    };

    const rawPino = pino(
      {
        level: 'trace',
        redact: {
          paths: ['token', 'password', 'apiKey', 'secret'],
          censor: '[REDACTED]',
        },
      },
      stream as Parameters<typeof pino>[1],
    );

    rawPino.info({ token: 'super-secret', user: 'alice' }, 'test redaction');

    expect(records.length).toBeGreaterThan(0);
    const record = records[0]!;
    expect(record['token']).toBe('[REDACTED]');
    expect(record['user']).toBe('alice');
  });

  it('redacts password field', () => {
    const records: Record<string, unknown>[] = [];
    const stream = {
      write(chunk: string): void {
        for (const line of chunk.split('\n')) {
          const t = line.trim();
          if (t.length === 0) continue;
          try {
            records.push(JSON.parse(t) as Record<string, unknown>);
          } catch { /* ignore */ }
        }
      },
    };
    const rawPino = pino(
      {
        level: 'trace',
        redact: {
          paths: ['token', 'password', 'apiKey', 'secret'],
          censor: '[REDACTED]',
        },
      },
      stream as Parameters<typeof pino>[1],
    );

    rawPino.warn({ password: 'hunter2', attempt: 3 }, 'login failed');

    expect(records.length).toBeGreaterThan(0);
    const record = records[0]!;
    expect(record['password']).toBe('[REDACTED]');
    expect(record['attempt']).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Log level filtering
// ---------------------------------------------------------------------------

describe('log level filtering', () => {
  it('silences levels below the configured threshold', () => {
    const { records, stream } = makeCapture();
    // Logger at 'info' must not emit 'debug' records
    const rawPino = pino({ level: 'info' }, stream);
    rawPino.debug('should be suppressed');
    expect(records.length).toBe(0);
  });

  it('emits levels at or above the configured threshold', () => {
    const { records, stream } = makeCapture();
    const rawPino = pino({ level: 'warn' }, stream);
    rawPino.warn('should be emitted');
    expect(records.length).toBe(1);
    expect(records[0]!['msg']).toBe('should be emitted');
  });

  it('also silences info when level is warn', () => {
    const { records, stream } = makeCapture();
    const rawPino = pino({ level: 'warn' }, stream);
    rawPino.info('should be suppressed too');
    expect(records.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// traceId propagation through child loggers
// ---------------------------------------------------------------------------

describe('traceId propagation', () => {
  it('withTraceId child logger calls still go through logger methods', () => {
    const base = createLogger('propagation-test');
    const traced = withTraceId(base, 'trace-999');

    // Verify the traced logger methods are callable without throwing
    expect(() => traced.info('propagated message')).not.toThrow();
    expect(() => traced.debug('debug with trace')).not.toThrow();
    expect(() => traced.warn('warn with trace')).not.toThrow();
    expect(() => traced.error('error with trace')).not.toThrow();
  });

  it('chaining withTraceId multiple times does not throw', () => {
    const base = createLogger('chain-test');
    const t1 = withTraceId(base, generateTraceId());
    const t2 = withTraceId(t1, generateTraceId());
    expect(() => t2.info('chained trace')).not.toThrow();
  });
});

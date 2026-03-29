// @lobster-engine/core — Structured logging via pino

import pino from 'pino';
import { randomUUID } from 'node:crypto';
import type { Logger, LogLevel } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LogContext {
  traceId?: string;
  botId?: string;
  sceneId?: string;
  workerId?: string;
  adapterId?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Sensitive field redaction
// ---------------------------------------------------------------------------

const REDACTED_PATHS: readonly string[] = [
  'token',
  'password',
  'apiKey',
  'secret',
  'authorization',
  'credentials',
  '*.token',
  '*.password',
  '*.apiKey',
  '*.secret',
  '*.authorization',
  '*.credentials',
];

// ---------------------------------------------------------------------------
// Error serializer — captures stack + recursive cause chain
// ---------------------------------------------------------------------------

interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

function serializeError(err: unknown): SerializedError {
  if (!(err instanceof Error)) {
    return { type: 'UnknownError', message: String(err) };
  }
  const result: SerializedError = {
    type: err.constructor.name,
    message: err.message,
    stack: err.stack,
  };
  if (err.cause !== undefined) {
    result.cause = serializeError(err.cause);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pino instance factory
// ---------------------------------------------------------------------------

function buildPinoOptions(): pino.LoggerOptions {
  const level: string =
    (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();

  const redact: pino.redactOptions = {
    paths: REDACTED_PATHS as string[],
    censor: '[REDACTED]',
  };

  const serializers: pino.LoggerOptions['serializers'] = {
    err: serializeError,
    error: serializeError,
  };

  const isDev =
    process.env['NODE_ENV'] === 'development' ||
    process.env['NODE_ENV'] === 'test';

  if (isDev) {
    return {
      level,
      redact,
      serializers,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return {
    level,
    redact,
    serializers,
  };
}

// Root pino logger — lazily initialised once per process
let _root: pino.Logger | undefined;

function getRootPino(): pino.Logger {
  if (_root === undefined) {
    _root = pino(buildPinoOptions());
  }
  return _root;
}

// ---------------------------------------------------------------------------
// PinoLogger — wraps pino.Logger and satisfies the Logger interface
// ---------------------------------------------------------------------------

class PinoLogger implements Logger {
  readonly #pino: pino.Logger;

  constructor(pinoInstance: pino.Logger) {
    this.#pino = pinoInstance;
  }

  trace(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      this.#pino.trace(context, message);
    } else {
      this.#pino.trace(message);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      this.#pino.debug(context, message);
    } else {
      this.#pino.debug(message);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      this.#pino.info(context, message);
    } else {
      this.#pino.info(message);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      this.#pino.warn(context, message);
    } else {
      this.#pino.warn(message);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      this.#pino.error(context, message);
    } else {
      this.#pino.error(message);
    }
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    if (context !== undefined) {
      this.#pino.fatal(context, message);
    } else {
      this.#pino.fatal(message);
    }
  }

  /** Return the underlying pino instance for child-logger creation. */
  getPino(): pino.Logger {
    return this.#pino;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a named logger with optional bound context fields.
 *
 * The logger respects the LOG_LEVEL environment variable (defaults to 'info')
 * and outputs pretty-printed logs in development / test environments or
 * structured JSON in production.
 *
 * @param name    - Component or service name bound as the `component` field.
 * @param context - Optional fields merged into every log record.
 */
export function createLogger(name: string, context?: LogContext): Logger {
  const bindings: Record<string, unknown> = { component: name };
  if (context !== undefined) {
    Object.assign(bindings, context);
  }
  const child = getRootPino().child(bindings);
  return new PinoLogger(child);
}

/**
 * Derive a child logger from an existing logger with a new traceId bound.
 *
 * @param logger  - An existing Logger returned by {@link createLogger}.
 * @param traceId - The trace identifier to propagate.
 */
export function withTraceId(logger: Logger, traceId: string): Logger {
  if (!(logger instanceof PinoLogger)) {
    // Graceful fallback: return the logger unchanged if it is not ours.
    return logger;
  }
  const child = logger.getPino().child({ traceId });
  return new PinoLogger(child);
}

/**
 * Generate a random RFC-4122 v4 UUID suitable for use as a traceId.
 */
export function generateTraceId(): string {
  return randomUUID();
}

// Re-export LogLevel for consumers that only import from logger.ts
export type { LogLevel };

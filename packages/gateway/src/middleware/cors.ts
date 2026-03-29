// @lobster-engine/gateway — CORS & Security Headers Middleware

import type { MiddlewareHandler } from 'hono';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CorsConfig {
  /** Allowed origins. Use `['*']` for any origin. Default: `['*']`. */
  readonly allowOrigins?: readonly string[];
  /** Allowed HTTP methods. Default: common REST methods. */
  readonly allowMethods?: readonly string[];
  /** Allowed request headers. */
  readonly allowHeaders?: readonly string[];
  /** Exposed response headers the browser may read. */
  readonly exposeHeaders?: readonly string[];
  /** Whether to include `Access-Control-Allow-Credentials`. Default: false. */
  readonly credentials?: boolean;
  /** Preflight cache duration in seconds. Default: 86400 (24 h). */
  readonly maxAge?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

const DEFAULT_ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-API-Key',
  'X-Bot-Token',
  'X-Request-ID',
] as const;

const DEFAULT_EXPOSE_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-Request-ID',
] as const;

// ---------------------------------------------------------------------------
// CORS Middleware
// ---------------------------------------------------------------------------

export function createCorsMiddleware(config?: CorsConfig): MiddlewareHandler {
  const origins = config?.allowOrigins ?? ['*'];
  const methods = (config?.allowMethods ?? DEFAULT_METHODS).join(', ');
  const allowHeaders = (config?.allowHeaders ?? DEFAULT_ALLOW_HEADERS).join(', ');
  const exposeHeaders = (config?.exposeHeaders ?? DEFAULT_EXPOSE_HEADERS).join(', ');
  const credentials = config?.credentials ?? false;
  const maxAge = String(config?.maxAge ?? 86400);

  return async (c, next) => {
    const origin = c.req.header('Origin') ?? '*';
    const allowed =
      origins.includes('*') || origins.includes(origin) ? origin : '';

    // Always set CORS headers on every response
    if (allowed !== '') {
      c.header('Access-Control-Allow-Origin', allowed);
    }
    c.header('Access-Control-Allow-Methods', methods);
    c.header('Access-Control-Allow-Headers', allowHeaders);
    c.header('Access-Control-Expose-Headers', exposeHeaders);
    c.header('Access-Control-Max-Age', maxAge);

    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    // Preflight — respond immediately
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// Security Headers Middleware
// ---------------------------------------------------------------------------

export function createSecurityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Prevent MIME sniffing
    c.header('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');
    // XSS protection (legacy browsers)
    c.header('X-XSS-Protection', '1; mode=block');
    // Referrer policy — don't leak full URL
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Permissions policy — restrict browser features
    c.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );
    // Content Security Policy — API-only, no inline scripts
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'",
    );
    // Strict Transport Security (only meaningful behind TLS)
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  };
}

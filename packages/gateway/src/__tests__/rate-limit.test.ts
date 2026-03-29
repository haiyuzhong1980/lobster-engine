// @lobster-engine/gateway — Rate limiter middleware tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createRateLimitMiddleware, RateLimiter } from '../middleware/rate-limit.js';
import type { RateLimitConfig } from '../middleware/rate-limit.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApp(config: RateLimitConfig = {}): {
  app: Hono;
  limiter: RateLimiter;
} {
  const app = new Hono();
  const { middleware, limiter } = createRateLimitMiddleware(config);

  app.use('*', middleware);
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/test', (c) => c.json({ ok: true }));
  app.post('/api/test', (c) => c.json({ ok: true }));

  return { app, limiter };
}

async function get(
  app: Hono,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(path, { method: 'GET', headers });
}

async function post(
  app: Hono,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(path, { method: 'POST', headers });
}

// ---------------------------------------------------------------------------
// Health endpoint bypass
// ---------------------------------------------------------------------------

describe('health endpoint bypass', () => {
  it('always passes /health regardless of global limits', async () => {
    const { app, limiter } = makeApp({ global: { windowMs: 60_000, maxRequests: 1 } });

    // Exhaust global limit
    await get(app, '/api/test');
    await get(app, '/api/test');

    // /health should still return 200
    const res = await get(app, '/health');
    expect(res.status).toBe(200);

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// Global tier
// ---------------------------------------------------------------------------

describe('global tier', () => {
  it('allows requests up to the configured limit', async () => {
    const { app, limiter } = makeApp({ global: { windowMs: 60_000, maxRequests: 3 } });

    for (let i = 0; i < 3; i++) {
      const res = await get(app, '/api/test');
      expect(res.status).toBe(200);
    }

    limiter.destroy();
  });

  it('returns 429 on the request that exceeds the global limit', async () => {
    const { app, limiter } = makeApp({ global: { windowMs: 60_000, maxRequests: 2 } });

    await get(app, '/api/test');
    await get(app, '/api/test');
    const res = await get(app, '/api/test');

    expect(res.status).toBe(429);

    limiter.destroy();
  });

  it('returns correct error body on 429', async () => {
    const { app, limiter } = makeApp({ global: { windowMs: 60_000, maxRequests: 1 } });

    await get(app, '/api/test');
    const res = await get(app, '/api/test');
    const body = (await res.json()) as { error: string; retryAfter: number };

    expect(body.error).toBe('Too Many Requests');
    expect(typeof body.retryAfter).toBe('number');
    expect(body.retryAfter).toBeGreaterThan(0);

    limiter.destroy();
  });

  it('sets Retry-After header on 429', async () => {
    const { app, limiter } = makeApp({ global: { windowMs: 30_000, maxRequests: 1 } });

    await get(app, '/api/test');
    const res = await get(app, '/api/test');

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// Per-bot tier (X-Bot-Token header)
// ---------------------------------------------------------------------------

describe('per-bot tier', () => {
  it('allows requests up to the per-bot limit', async () => {
    const { app, limiter } = makeApp({
      perBot: { windowMs: 60_000, maxRequests: 2 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    for (let i = 0; i < 2; i++) {
      const res = await get(app, '/api/test', { 'x-bot-token': 'bot-abc' });
      expect(res.status).toBe(200);
    }

    limiter.destroy();
  });

  it('returns 429 when the per-bot limit is exceeded', async () => {
    const { app, limiter } = makeApp({
      perBot: { windowMs: 60_000, maxRequests: 2 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    await get(app, '/api/test', { 'x-bot-token': 'bot-abc' });
    await get(app, '/api/test', { 'x-bot-token': 'bot-abc' });
    const res = await get(app, '/api/test', { 'x-bot-token': 'bot-abc' });

    expect(res.status).toBe(429);

    limiter.destroy();
  });

  it('tracks different bot tokens independently', async () => {
    const { app, limiter } = makeApp({
      perBot: { windowMs: 60_000, maxRequests: 1 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    // Exhaust bot-A
    await get(app, '/api/test', { 'x-bot-token': 'bot-A' });
    const resA = await get(app, '/api/test', { 'x-bot-token': 'bot-A' });
    expect(resA.status).toBe(429);

    // bot-B is unaffected
    const resB = await get(app, '/api/test', { 'x-bot-token': 'bot-B' });
    expect(resB.status).toBe(200);

    limiter.destroy();
  });

  it('does not apply per-bot limit to requests without a bot token', async () => {
    const { app, limiter } = makeApp({
      perBot: { windowMs: 60_000, maxRequests: 1 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    // Multiple requests with no bot token should not be limited by per-bot tier
    for (let i = 0; i < 5; i++) {
      const res = await get(app, '/api/test');
      expect(res.status).toBe(200);
    }

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// Per-user tier (X-Api-Key header)
// ---------------------------------------------------------------------------

describe('per-user tier', () => {
  it('allows requests up to the per-user limit', async () => {
    const { app, limiter } = makeApp({
      perUser: { windowMs: 60_000, maxRequests: 3 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    for (let i = 0; i < 3; i++) {
      const res = await get(app, '/api/test', { 'x-api-key': 'key-xyz' });
      expect(res.status).toBe(200);
    }

    limiter.destroy();
  });

  it('returns 429 when the per-user limit is exceeded', async () => {
    const { app, limiter } = makeApp({
      perUser: { windowMs: 60_000, maxRequests: 2 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    await get(app, '/api/test', { 'x-api-key': 'key-xyz' });
    await get(app, '/api/test', { 'x-api-key': 'key-xyz' });
    const res = await get(app, '/api/test', { 'x-api-key': 'key-xyz' });

    expect(res.status).toBe(429);

    limiter.destroy();
  });

  it('tracks different API keys independently', async () => {
    const { app, limiter } = makeApp({
      perUser: { windowMs: 60_000, maxRequests: 1 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    await get(app, '/api/test', { 'x-api-key': 'key-1' });
    const res1 = await get(app, '/api/test', { 'x-api-key': 'key-1' });
    expect(res1.status).toBe(429);

    const res2 = await get(app, '/api/test', { 'x-api-key': 'key-2' });
    expect(res2.status).toBe(200);

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// Rate limit response headers
// ---------------------------------------------------------------------------

describe('rate limit headers', () => {
  it('sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on allowed requests', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 60_000, maxRequests: 10 },
    });

    const res = await get(app, '/api/test');
    expect(res.status).toBe(200);

    expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
    expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy();
    expect(res.headers.get('x-ratelimit-reset')).toBeTruthy();

    limiter.destroy();
  });

  it('X-RateLimit-Remaining decreases with each request', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 60_000, maxRequests: 5 },
    });

    const res1 = await get(app, '/api/test');
    const remaining1 = Number(res1.headers.get('x-ratelimit-remaining'));

    const res2 = await get(app, '/api/test');
    const remaining2 = Number(res2.headers.get('x-ratelimit-remaining'));

    expect(remaining2).toBeLessThan(remaining1);

    limiter.destroy();
  });

  it('X-RateLimit-Remaining is 0 on 429 responses', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 60_000, maxRequests: 1 },
    });

    await get(app, '/api/test');
    const res = await get(app, '/api/test');
    expect(res.status).toBe(429);
    expect(res.headers.get('x-ratelimit-remaining')).toBe('0');

    limiter.destroy();
  });

  it('X-RateLimit-Limit reflects the configured max for the most restrictive tier', async () => {
    const { app, limiter } = makeApp({
      perBot: { windowMs: 60_000, maxRequests: 5 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    const res = await get(app, '/api/test', { 'x-bot-token': 'my-bot' });
    expect(res.headers.get('x-ratelimit-limit')).toBe('5');

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// Sliding window semantics
// ---------------------------------------------------------------------------

describe('sliding window semantics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows new requests after the window expires', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 1_000, maxRequests: 2 },
    });

    // Exhaust limit
    await get(app, '/api/test');
    await get(app, '/api/test');
    const blocked = await get(app, '/api/test');
    expect(blocked.status).toBe(429);

    // Advance past the window
    vi.advanceTimersByTime(1_100);

    const allowed = await get(app, '/api/test');
    expect(allowed.status).toBe(200);

    limiter.destroy();
  });

  it('does not reset counter until full window elapses', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 2_000, maxRequests: 2 },
    });

    await get(app, '/api/test');
    await get(app, '/api/test');

    // Only halfway through the window — still limited
    vi.advanceTimersByTime(999);
    const stillBlocked = await get(app, '/api/test');
    expect(stillBlocked.status).toBe(429);

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// RateLimiter.destroy()
// ---------------------------------------------------------------------------

describe('RateLimiter lifecycle', () => {
  it('destroy() can be called without error', () => {
    const limiter = new RateLimiter({});
    expect(() => limiter.destroy()).not.toThrow();
  });

  it('destroy() clears the cleanup interval', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const limiter = new RateLimiter({});
    limiter.destroy();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Default configuration (no config object passed)
// ---------------------------------------------------------------------------

describe('default configuration', () => {
  it('allows requests when no config is provided', async () => {
    const { app, limiter } = makeApp();
    const res = await get(app, '/api/test');
    expect(res.status).toBe(200);
    limiter.destroy();
  });

  it('uses 60 req/min default for per-bot tier', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 60_000, maxRequests: 10_000 },
    });

    // Send 60 requests with a bot token — all should pass
    for (let i = 0; i < 60; i++) {
      const res = await get(app, '/api/test', { 'x-bot-token': 'default-bot' });
      expect(res.status).toBe(200);
    }

    // 61st request should be blocked
    const res = await get(app, '/api/test', { 'x-bot-token': 'default-bot' });
    expect(res.status).toBe(429);

    limiter.destroy();
  });

  it('uses 120 req/min default for per-user tier', async () => {
    const { app, limiter } = makeApp({
      global: { windowMs: 60_000, maxRequests: 10_000 },
    });

    for (let i = 0; i < 120; i++) {
      const res = await get(app, '/api/test', { 'x-api-key': 'default-user' });
      expect(res.status).toBe(200);
    }

    const res = await get(app, '/api/test', { 'x-api-key': 'default-user' });
    expect(res.status).toBe(429);

    limiter.destroy();
  });
});

// ---------------------------------------------------------------------------
// Tier interaction — global blocks even when identity tiers are still clear
// ---------------------------------------------------------------------------

describe('tier priority', () => {
  it('global limit blocks even when per-bot limit is not reached', async () => {
    const { app, limiter } = makeApp({
      perBot: { windowMs: 60_000, maxRequests: 100 },
      global: { windowMs: 60_000, maxRequests: 2 },
    });

    await get(app, '/api/test', { 'x-bot-token': 'bot-X' });
    await get(app, '/api/test', { 'x-bot-token': 'bot-X' });
    const res = await get(app, '/api/test', { 'x-bot-token': 'bot-X' });

    expect(res.status).toBe(429);

    limiter.destroy();
  });

  it('per-user limit blocks even when global limit is not reached', async () => {
    const { app, limiter } = makeApp({
      perUser: { windowMs: 60_000, maxRequests: 1 },
      global: { windowMs: 60_000, maxRequests: 1000 },
    });

    await get(app, '/api/test', { 'x-api-key': 'heavy-user' });
    const res = await get(app, '/api/test', { 'x-api-key': 'heavy-user' });

    expect(res.status).toBe(429);

    limiter.destroy();
  });
});

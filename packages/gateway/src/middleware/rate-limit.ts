// @lobster-engine/gateway — Sliding window rate limiter middleware

import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export interface RateLimitTierConfig {
  readonly windowMs: number;
  readonly maxRequests: number;
}

export interface RateLimitConfig {
  readonly perBot?: RateLimitTierConfig;
  readonly perUser?: RateLimitTierConfig;
  readonly global?: RateLimitTierConfig;
}

// ---------------------------------------------------------------------------
// Default tier settings
// ---------------------------------------------------------------------------

const DEFAULT_PER_BOT: RateLimitTierConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

const DEFAULT_PER_USER: RateLimitTierConfig = {
  windowMs: 60_000,
  maxRequests: 120,
};

const DEFAULT_GLOBAL: RateLimitTierConfig = {
  windowMs: 60_000,
  maxRequests: 1000,
};

// ---------------------------------------------------------------------------
// Sliding window store — tracks hit timestamps per key
// ---------------------------------------------------------------------------

/** Returns the count of timestamps within the window and the pruned list. */
function slideWindow(
  timestamps: readonly number[],
  now: number,
  windowMs: number,
): readonly number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

/**
 * Immutable store for sliding-window counters.
 * Keys map to ordered arrays of hit timestamps (oldest → newest).
 */
type WindowStore = ReadonlyMap<string, readonly number[]>;

function recordHit(
  store: WindowStore,
  key: string,
  now: number,
  windowMs: number,
): { readonly store: WindowStore; readonly count: number } {
  const raw = store.get(key) ?? [];
  const pruned = slideWindow(raw, now, windowMs);
  const updated = [...pruned, now];
  const next = new Map(store);
  next.set(key, updated);
  return { store: next as WindowStore, count: updated.length };
}

function peekCount(store: WindowStore, key: string, now: number, windowMs: number): number {
  const raw = store.get(key) ?? [];
  return slideWindow(raw, now, windowMs).length;
}

// ---------------------------------------------------------------------------
// Identity extraction helpers
// ---------------------------------------------------------------------------

function extractBotId(c: Context): string | undefined {
  const header = c.req.header('x-bot-token');
  if (header !== undefined && header !== '') return `bot:${header}`;
  // Fall back to auth context if set upstream
  const botId = c.get('botId') as string | undefined;
  if (typeof botId === 'string' && botId !== '') return `bot:${botId}`;
  return undefined;
}

function extractUserId(c: Context): string | undefined {
  const apiKey = c.req.header('x-api-key');
  if (apiKey !== undefined && apiKey !== '') return `user:apikey:${apiKey}`;
  // Check JWT sub from auth context (populated by upstream auth middleware)
  const sub = c.get('jwtSub') as string | undefined;
  if (typeof sub === 'string' && sub !== '') return `user:jwt:${sub}`;
  return undefined;
}

// ---------------------------------------------------------------------------
// 429 response helpers
// ---------------------------------------------------------------------------

interface RateLimitErrorBody {
  readonly error: 'Too Many Requests';
  readonly retryAfter: number;
}

function tooManyRequests(c: Context, retryAfterSeconds: number): Response {
  const body: RateLimitErrorBody = {
    error: 'Too Many Requests',
    retryAfter: retryAfterSeconds,
  };
  return c.json(body, 429, {
    'Retry-After': String(retryAfterSeconds),
  });
}

// ---------------------------------------------------------------------------
// RateLimiter — encapsulates mutable store state and cleanup
// ---------------------------------------------------------------------------

interface TierState {
  readonly config: RateLimitTierConfig;
  store: WindowStore;
}

export class RateLimiter {
  private readonly perBotTier: TierState;
  private readonly perUserTier: TierState;
  private readonly globalTier: TierState;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config: RateLimitConfig) {
    this.perBotTier = {
      config: config.perBot ?? DEFAULT_PER_BOT,
      store: new Map() as WindowStore,
    };
    this.perUserTier = {
      config: config.perUser ?? DEFAULT_PER_USER,
      store: new Map() as WindowStore,
    };
    this.globalTier = {
      config: config.global ?? DEFAULT_GLOBAL,
      store: new Map() as WindowStore,
    };

    // Periodically evict keys whose entire window has expired
    this.cleanupTimer = setInterval(() => {
      this.pruneStaleKeys();
    }, 60_000);

    // Allow Node.js to exit even if the timer is still running
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /** Release the cleanup timer. Call this when the server stops. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Process a single request through all applicable tiers.
   * Returns undefined when the request is allowed, or a 429 Response otherwise.
   */
  check(c: Context): Response | undefined {
    const now = Date.now();

    // --- Global tier (always evaluated) ---
    const globalCheck = this.applyTier(this.globalTier, '__global__', now);
    this.globalTier.store = globalCheck.store;

    if (globalCheck.limited) {
      const retryAfter = Math.ceil(this.globalTier.config.windowMs / 1000);
      this.setRateLimitHeaders(c, this.globalTier.config.maxRequests, 0, retryAfter);
      return tooManyRequests(c, retryAfter);
    }

    // --- Per-user tier ---
    const userId = extractUserId(c);
    if (userId !== undefined) {
      const userCheck = this.applyTier(this.perUserTier, userId, now);
      this.perUserTier.store = userCheck.store;

      if (userCheck.limited) {
        const retryAfter = Math.ceil(this.perUserTier.config.windowMs / 1000);
        this.setRateLimitHeaders(c, this.perUserTier.config.maxRequests, 0, retryAfter);
        return tooManyRequests(c, retryAfter);
      }

      const remaining = Math.max(0, this.perUserTier.config.maxRequests - userCheck.count);
      const resetAt = Math.ceil((now + this.perUserTier.config.windowMs) / 1000);
      this.setRateLimitHeaders(c, this.perUserTier.config.maxRequests, remaining, resetAt);
    }

    // --- Per-bot tier ---
    const botId = extractBotId(c);
    if (botId !== undefined) {
      const botCheck = this.applyTier(this.perBotTier, botId, now);
      this.perBotTier.store = botCheck.store;

      if (botCheck.limited) {
        const retryAfter = Math.ceil(this.perBotTier.config.windowMs / 1000);
        this.setRateLimitHeaders(c, this.perBotTier.config.maxRequests, 0, retryAfter);
        return tooManyRequests(c, retryAfter);
      }

      const remaining = Math.max(0, this.perBotTier.config.maxRequests - botCheck.count);
      const resetAt = Math.ceil((now + this.perBotTier.config.windowMs) / 1000);
      this.setRateLimitHeaders(c, this.perBotTier.config.maxRequests, remaining, resetAt);
    }

    // --- Set global remaining headers if no identity tiers applied ---
    if (userId === undefined && botId === undefined) {
      const globalCount = peekCount(this.globalTier.store, '__global__', now, this.globalTier.config.windowMs);
      const remaining = Math.max(0, this.globalTier.config.maxRequests - globalCount);
      const resetAt = Math.ceil((now + this.globalTier.config.windowMs) / 1000);
      this.setRateLimitHeaders(c, this.globalTier.config.maxRequests, remaining, resetAt);
    }

    return undefined;
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  private applyTier(
    tier: TierState,
    key: string,
    now: number,
  ): { readonly store: WindowStore; readonly count: number; readonly limited: boolean } {
    const result = recordHit(tier.store, key, now, tier.config.windowMs);
    const limited = result.count > tier.config.maxRequests;
    return { store: result.store, count: result.count, limited };
  }

  private setRateLimitHeaders(
    c: Context,
    limit: number,
    remaining: number,
    reset: number,
  ): void {
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(reset));
  }

  private pruneStaleKeys(): void {
    const now = Date.now();

    for (const tier of [this.perBotTier, this.perUserTier, this.globalTier]) {
      const next = new Map<string, readonly number[]>();
      for (const [key, timestamps] of tier.store) {
        const pruned = slideWindow(timestamps, now, tier.config.windowMs);
        if (pruned.length > 0) {
          next.set(key, pruned);
        }
        // Keys with no remaining timestamps are dropped (stale eviction)
      }
      tier.store = next as WindowStore;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a Hono middleware that enforces sliding-window rate limits across
 * three tiers: global, per-user, and per-bot.
 *
 * The `/health` endpoint is always skipped.
 *
 * @example
 * ```ts
 * const { middleware, limiter } = createRateLimitMiddleware({
 *   perBot:  { windowMs: 60_000, maxRequests: 60 },
 *   perUser: { windowMs: 60_000, maxRequests: 120 },
 *   global:  { windowMs: 60_000, maxRequests: 1000 },
 * });
 *
 * app.use('*', middleware);
 * // On server shutdown:
 * limiter.destroy();
 * ```
 */
export function createRateLimitMiddleware(config: RateLimitConfig = {}): {
  readonly middleware: (c: Context, next: Next) => Promise<Response | void>;
  readonly limiter: RateLimiter;
} {
  const limiter = new RateLimiter(config);

  const middleware = async (c: Context, next: Next): Promise<Response | void> => {
    // Skip health endpoint
    if (c.req.path === '/health') {
      return next();
    }

    const errorResponse = limiter.check(c);
    if (errorResponse !== undefined) {
      return errorResponse;
    }

    return next();
  };

  return { middleware, limiter };
}

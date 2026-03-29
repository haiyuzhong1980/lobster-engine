// @lobster-engine/gateway — GatewayServer

import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { registerOpenAPIRoute } from './openapi.js';
import { MetricsRegistry, createMetricsMiddleware, createMetricsHandler } from './metrics.js';
import { createAuthMiddleware, InMemoryApiKeyStore } from './middleware/auth.js';
import type { AuthConfig } from './middleware/auth.js';
import { createCorsMiddleware, createSecurityHeadersMiddleware } from './middleware/cors.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import type { NatsClient } from '@lobster-engine/core';
import { NatsSubjects, validateSubjectToken } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  readonly port: number;
  readonly host: string;
  readonly jwtSecret?: string;
  readonly apiKeys?: readonly string[];
  /**
   * When true, route bot/scene lifecycle events through NATS instead of
   * handling them in-process. Requires `nats` to be provided.
   */
  readonly useNats?: boolean;
  /** Optional NatsClient to use for event publishing. */
  readonly nats?: NatsClient;
}

// ---------------------------------------------------------------------------
// In-memory data models
// ---------------------------------------------------------------------------

export interface BotRecord {
  readonly id: string;
  readonly platform: string;
  readonly token: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: 'idle' | 'active' | 'error';
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SceneRecord {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly status: 'waiting' | 'active' | 'paused' | 'ended';
  readonly playerCount: number;
  readonly botIds: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function fail(error: string): ApiResponse<never> {
  return { success: false, error };
}

// ---------------------------------------------------------------------------
// CRIT-02: Sanitize bot records — strip the `token` field from responses
// ---------------------------------------------------------------------------

export type SanitizedBotRecord = Omit<BotRecord, 'token'>;

function sanitizeBotRecord(bot: BotRecord): SanitizedBotRecord {
  // Destructure to exclude token; return a new object (immutable)
  const { token: _token, ...safe } = bot;
  return safe;
}

// ---------------------------------------------------------------------------
// CRIT-03: API-boundary validation for user-supplied identifiers
// ---------------------------------------------------------------------------

function requireValidId(value: string, label: string): string | null {
  if (!validateSubjectToken(value)) {
    return `Invalid ${label}: must match /^[a-zA-Z0-9_-]{1,128}$/`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// HIGH-05: Request body size limit — 1 MB
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Input validation helpers
// ---------------------------------------------------------------------------

/** Allowed pattern for ID fields: alphanumeric, underscore, hyphen, colon. */
const ID_PATTERN = /^[\w\-:]+$/;

/**
 * Validate a string field that represents a short label (platform, sceneType,
 * sceneName, botId, sceneId, actionType).  Returns an error message on
 * failure, or null when valid.
 */
function validateShortString(value: string, fieldName: string, maxLen = 128): string | null {
  if (value.length === 0) return `${fieldName} must not be empty`;
  if (value.length > maxLen) return `${fieldName} exceeds maximum length of ${maxLen}`;
  return null;
}

/**
 * Validate an ID field (botId, sceneId): alphanumeric + underscore + hyphen +
 * colon, max 128 chars.
 */
function validateId(value: string, fieldName: string): string | null {
  const lenErr = validateShortString(value, fieldName, 128);
  if (lenErr !== null) return lenErr;
  if (!ID_PATTERN.test(value)) {
    return `${fieldName} may only contain letters, digits, underscores, hyphens, and colons`;
  }
  return null;
}

/**
 * Validate a long text field (content), max 10 000 chars.
 */
function validateContent(value: string, fieldName: string): string | null {
  if (value.length > 10_000) return `${fieldName} exceeds maximum length of 10000`;
  return null;
}

// ---------------------------------------------------------------------------
// GatewayServer
// ---------------------------------------------------------------------------

export class GatewayServer {
  private readonly app: Hono;
  private server?: ReturnType<typeof serve>;

  private readonly bots = new Map<string, BotRecord>();
  private readonly scenes = new Map<string, SceneRecord>();

  /** Per-server Prometheus registry — isolated so test instances don't clash. */
  readonly metrics: MetricsRegistry;

  /** True when NATS is configured and enabled via config.useNats. */
  private get natsEnabled(): boolean {
    return this.config.useNats === true && this.config.nats !== undefined;
  }

  constructor(readonly config: GatewayConfig) {
    this.metrics = new MetricsRegistry();
    this.app = new Hono();
    this.setupRoutes();
  }

  // --------------------------------------------------------------------------
  // Route setup
  // --------------------------------------------------------------------------

  private setupRoutes(): void {
    // MED-08: Global error handler — log full error internally, return generic
    // message to clients. Registered before all middleware so it catches
    // everything including middleware errors.
    this.app.onError((err, c) => {
      // eslint-disable-next-line no-console -- intentional server-side error log
      console.error('[GatewayServer] Unhandled error:', err);
      return c.json<ApiResponse<never>>(fail('Internal server error'), 500);
    });

    // HIGH-05: Request body size limit — 1 MB
    this.app.use('*', bodyLimit({ maxSize: MAX_BODY_SIZE }));

    // CRIT-01: CORS middleware — must come before auth so preflight (OPTIONS)
    // requests are handled without credentials.
    this.app.use('*', createCorsMiddleware());

    // CRIT-01: Security headers — apply to every response.
    this.app.use('*', createSecurityHeadersMiddleware());

    // Prometheus metrics middleware — records every request automatically
    this.app.use('*', createMetricsMiddleware(this.metrics));

    // CRIT-01: Rate limiting — applied globally (skips /health internally).
    const { middleware: rateLimitMiddleware } = createRateLimitMiddleware();
    this.app.use('*', rateLimitMiddleware);

    // CRIT-01: Authentication middleware — only wired when jwtSecret or
    // apiKeys are provided. When neither is set the server runs in
    // "open" mode (development/testing). /health and /metrics are always
    // public.
    if (this.config.jwtSecret !== undefined || (this.config.apiKeys !== undefined && this.config.apiKeys.length > 0)) {
      const authConfig: AuthConfig = {
        ...(this.config.jwtSecret !== undefined
          ? { jwt: { secret: this.config.jwtSecret } }
          : {}),
        ...(this.config.apiKeys !== undefined && this.config.apiKeys.length > 0
          ? {
              apiKey: {
                store: new InMemoryApiKeyStore(
                  this.config.apiKeys.map((k) => [k, 'admin' as const] as const),
                ),
              },
            }
          : {}),
        publicPaths: ['/health', '/metrics', '/doc'],
      };

      this.app.use('*', createAuthMiddleware(authConfig));
    }

    // Prometheus /metrics scrape endpoint
    this.app.get('/metrics', createMetricsHandler(this.metrics));

    // Health
    this.app.get('/health', (c) =>
      c.json<ApiResponse<{ status: string; timestamp: number }>>(
        ok({ status: 'ok', timestamp: Date.now() }),
      ),
    );

    // --- Bot management ---

    this.app.post('/api/v1/bots/register', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      if (
        typeof body !== 'object' ||
        body === null ||
        !('platform' in body) ||
        typeof (body as Record<string, unknown>)['platform'] !== 'string'
      ) {
        return c.json<ApiResponse<never>>(fail('Missing required field: platform'), 400);
      }

      const input = body as Record<string, unknown>;
      const platform = input['platform'] as string;

      // Validate string field lengths/formats.
      const platformErr = validateShortString(platform, 'platform');
      if (platformErr !== null) {
        return c.json<ApiResponse<never>>(fail(platformErr), 400);
      }

      const token =
        typeof input['token'] === 'string' ? input['token'] : crypto.randomUUID();
      const metadata =
        typeof input['metadata'] === 'object' &&
        input['metadata'] !== null &&
        !Array.isArray(input['metadata'])
          ? (input['metadata'] as Record<string, unknown>)
          : {};

      const id = crypto.randomUUID();
      const now = Date.now();

      const bot: BotRecord = {
        id,
        platform,
        token,
        metadata,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
      };

      this.bots.set(id, bot);

      // P4.4 — publish bot registration event to NATS when available.
      if (this.natsEnabled) {
        this.config.nats!.publish(NatsSubjects.systemControl, {
          type: 'bot.register',
          data: bot,
        });
      }

      return c.json<ApiResponse<BotRecord>>(ok(bot), 201);
    });

    this.app.get('/api/v1/bots/:id', (c) => {
      const id = c.req.param('id');
      const bot = this.bots.get(id);
      if (bot === undefined) {
        return c.json<ApiResponse<never>>(fail(`Bot "${id}" not found`), 404);
      }
      // CRIT-02: Strip token from GET responses
      return c.json<ApiResponse<SanitizedBotRecord>>(ok(sanitizeBotRecord(bot)));
    });

    this.app.get('/api/v1/bots', (c) => {
      const bots = Array.from(this.bots.values());
      const url = new URL(c.req.url);
      const rawPage = parseInt(url.searchParams.get('page') ?? '1', 10);
      const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      if (Number.isNaN(rawPage) || Number.isNaN(rawLimit)) {
        return c.json<ApiResponse<never>>(fail('Invalid pagination parameters'), 400);
      }
      const page = Math.max(1, rawPage);
      const limit = Math.min(100, Math.max(1, rawLimit));
      const offset = (page - 1) * limit;
      const slice = bots.slice(offset, offset + limit);
      // CRIT-02: Strip tokens from list responses
      return c.json<ApiResponse<SanitizedBotRecord[]>>({
        success: true,
        data: slice.map(sanitizeBotRecord),
        meta: { total: bots.length, page, limit },
      });
    });

    this.app.patch('/api/v1/bots/:id', async (c) => {
      const id = c.req.param('id');
      const existing = this.bots.get(id);
      if (existing === undefined) {
        return c.json<ApiResponse<never>>(fail(`Bot "${id}" not found`), 404);
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      // Validate string field lengths/formats when present.
      if (typeof input['platform'] === 'string') {
        const platformErr = validateShortString(input['platform'], 'platform');
        if (platformErr !== null) {
          return c.json<ApiResponse<never>>(fail(platformErr), 400);
        }
      }

      const updated: BotRecord = {
        ...existing,
        platform:
          typeof input['platform'] === 'string' ? input['platform'] : existing.platform,
        metadata:
          typeof input['metadata'] === 'object' &&
          input['metadata'] !== null &&
          !Array.isArray(input['metadata'])
            ? (input['metadata'] as Record<string, unknown>)
            : existing.metadata,
        status:
          input['status'] === 'idle' ||
          input['status'] === 'active' ||
          input['status'] === 'error'
            ? input['status']
            : existing.status,
        updatedAt: Date.now(),
      };

      this.bots.set(id, updated);
      // CRIT-02: Strip token from PATCH responses
      return c.json<ApiResponse<SanitizedBotRecord>>(ok(sanitizeBotRecord(updated)));
    });

    this.app.delete('/api/v1/bots/:id', (c) => {
      const id = c.req.param('id');
      const existed = this.bots.delete(id);
      if (!existed) {
        return c.json<ApiResponse<never>>(fail(`Bot "${id}" not found`), 404);
      }
      return c.json<ApiResponse<{ deleted: string }>>(ok({ deleted: id }));
    });

    // --- Scene management ---

    this.app.post('/api/v1/scenes/join', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const botId = typeof input['botId'] === 'string' ? input['botId'] : undefined;
      const sceneType =
        typeof input['sceneType'] === 'string' ? input['sceneType'] : undefined;

      if (botId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: botId'), 400);
      }
      if (sceneType === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: sceneType'), 400);
      }

      // Validate string field lengths/formats.
      const botIdErr = requireValidId(botId, 'botId');
      if (botIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(botIdErr), 400);
      }
      const sceneTypeErr = validateShortString(sceneType, 'sceneType');
      if (sceneTypeErr !== null) {
        return c.json<ApiResponse<never>>(fail(sceneTypeErr), 400);
      }
      if (typeof input['sceneId'] === 'string') {
        const sceneIdErr = requireValidId(input['sceneId'], 'sceneId');
        if (sceneIdErr !== null) {
          return c.json<ApiResponse<never>>(fail(sceneIdErr), 400);
        }
      }
      if (typeof input['sceneName'] === 'string') {
        const sceneNameErr = validateShortString(input['sceneName'], 'sceneName');
        if (sceneNameErr !== null) {
          return c.json<ApiResponse<never>>(fail(sceneNameErr), 400);
        }
      }

      if (!this.bots.has(botId)) {
        return c.json<ApiResponse<never>>(fail(`Bot "${botId}" not found`), 404);
      }

      const sceneId =
        typeof input['sceneId'] === 'string'
          ? input['sceneId']
          : `${sceneType}_${crypto.randomUUID()}`;
      const sceneName =
        typeof input['sceneName'] === 'string' ? input['sceneName'] : sceneType;
      const config =
        typeof input['config'] === 'object' &&
        input['config'] !== null &&
        !Array.isArray(input['config'])
          ? (input['config'] as Record<string, unknown>)
          : {};

      const existing = this.scenes.get(sceneId);
      const now = Date.now();

      if (existing !== undefined) {
        const already = existing.botIds.includes(botId);
        const updated: SceneRecord = {
          ...existing,
          botIds: already ? existing.botIds : [...existing.botIds, botId],
          playerCount: already ? existing.playerCount : existing.playerCount + 1,
          updatedAt: now,
        };
        this.scenes.set(sceneId, updated);

        // P4.4 — publish scene join event to NATS when available.
        if (this.natsEnabled) {
          this.config.nats!.publish(NatsSubjects.sceneState(sceneId), {
            type: 'join',
            botId,
          });
        }

        return c.json<ApiResponse<SceneRecord>>(ok(updated));
      }

      const scene: SceneRecord = {
        id: sceneId,
        type: sceneType,
        name: sceneName,
        status: 'waiting',
        playerCount: 1,
        botIds: [botId],
        config,
        createdAt: now,
        updatedAt: now,
      };

      this.scenes.set(sceneId, scene);

      // P4.4 — publish scene join event to NATS when available.
      if (this.natsEnabled) {
        this.config.nats!.publish(NatsSubjects.sceneState(sceneId), {
          type: 'join',
          botId,
        });
      }

      return c.json<ApiResponse<SceneRecord>>(ok(scene), 201);
    });

    this.app.post('/api/v1/scenes/leave', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const botId = typeof input['botId'] === 'string' ? input['botId'] : undefined;
      const sceneId = typeof input['sceneId'] === 'string' ? input['sceneId'] : undefined;

      if (botId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: botId'), 400);
      }
      if (sceneId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: sceneId'), 400);
      }

      // CRIT-03: Validate user-supplied IDs at the API boundary
      const leaveBotIdErr = requireValidId(botId, 'botId');
      if (leaveBotIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(leaveBotIdErr), 400);
      }
      const leaveSceneIdErr = requireValidId(sceneId, 'sceneId');
      if (leaveSceneIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(leaveSceneIdErr), 400);
      }

      const scene = this.scenes.get(sceneId);
      if (scene === undefined) {
        return c.json<ApiResponse<never>>(fail(`Scene "${sceneId}" not found`), 404);
      }

      const newBotIds = scene.botIds.filter((id) => id !== botId);
      const updated: SceneRecord = {
        ...scene,
        botIds: newBotIds,
        playerCount: newBotIds.length,
        status: newBotIds.length === 0 ? 'ended' : scene.status,
        updatedAt: Date.now(),
      };

      this.scenes.set(sceneId, updated);

      // P4.4 — publish scene leave event to NATS when available.
      if (this.natsEnabled) {
        this.config.nats!.publish(NatsSubjects.sceneState(sceneId), {
          type: 'leave',
          botId,
        });
      }

      return c.json<ApiResponse<SceneRecord>>(ok(updated));
    });

    this.app.get('/api/v1/scenes/:id', (c) => {
      const id = c.req.param('id');
      const scene = this.scenes.get(id);
      if (scene === undefined) {
        return c.json<ApiResponse<never>>(fail(`Scene "${id}" not found`), 404);
      }
      return c.json<ApiResponse<SceneRecord>>(ok(scene));
    });

    this.app.get('/api/v1/scenes', (c) => {
      const allScenes = Array.from(this.scenes.values());
      const url = new URL(c.req.url);
      const rawPage = parseInt(url.searchParams.get('page') ?? '1', 10);
      const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      if (Number.isNaN(rawPage) || Number.isNaN(rawLimit)) {
        return c.json<ApiResponse<never>>(fail('Invalid pagination parameters'), 400);
      }
      const page = Math.max(1, rawPage);
      const limit = Math.min(100, Math.max(1, rawLimit));
      const offset = (page - 1) * limit;
      const slice = allScenes.slice(offset, offset + limit);
      return c.json<ApiResponse<SceneRecord[]>>({
        success: true,
        data: slice,
        meta: { total: allScenes.length, page, limit },
      });
    });

    this.app.post('/api/v1/scenes/:id/action', async (c) => {
      const sceneId = c.req.param('id');
      const scene = this.scenes.get(sceneId);
      if (scene === undefined) {
        return c.json<ApiResponse<never>>(fail(`Scene "${sceneId}" not found`), 404);
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const botId = typeof input['botId'] === 'string' ? input['botId'] : undefined;
      const actionType =
        typeof input['type'] === 'string' ? input['type'] : undefined;

      if (botId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: botId'), 400);
      }
      if (actionType === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: type'), 400);
      }

      // Validate string field lengths/formats.
      const actionBotIdErr = requireValidId(botId, 'botId');
      if (actionBotIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(actionBotIdErr), 400);
      }
      const actionTypeErr = validateShortString(actionType, 'type');
      if (actionTypeErr !== null) {
        return c.json<ApiResponse<never>>(fail(actionTypeErr), 400);
      }
      if (typeof input['content'] === 'string') {
        const contentErr = validateContent(input['content'], 'content');
        if (contentErr !== null) {
          return c.json<ApiResponse<never>>(fail(contentErr), 400);
        }
      }

      if (!scene.botIds.includes(botId)) {
        return c.json<ApiResponse<never>>(
          fail(`Bot "${botId}" is not a member of scene "${sceneId}"`),
          403,
        );
      }

      const turnId =
        typeof input['turnId'] === 'string' ? input['turnId'] : crypto.randomUUID();

      const result = {
        sceneId,
        botId,
        type: actionType,
        content: typeof input['content'] === 'string' ? input['content'] : '',
        target:
          typeof input['target'] === 'string' ? input['target'] : undefined,
        turnId,
        timestamp: Date.now(),
      };

      // P4.4 — publish action to NATS worker assignment queue when available.
      if (this.natsEnabled) {
        this.config.nats!.publish(NatsSubjects.workerAssign, {
          botId,
          sceneId,
          action: {
            type: actionType,
            content: result.content,
            target: result.target,
          },
          turnId,
        });
      }

      return c.json<ApiResponse<typeof result>>(ok(result));
    });

    // --- OpenAPI documentation ---

    registerOpenAPIRoute(this.app);

    // --- Status & Metrics ---

    this.app.get('/api/v1/status', (c) => {
      return c.json<ApiResponse<{ botsCount: number; scenesCount: number; uptime: number }>>(
        ok({
          botsCount: this.bots.size,
          scenesCount: this.scenes.size,
          uptime: process.uptime(),
        }),
      );
    });

    this.app.get('/api/v1/metrics', (c) => {
      const scenesArray = Array.from(this.scenes.values());
      const botsArray = Array.from(this.bots.values());

      const scenesByStatus = scenesArray.reduce<Record<string, number>>((acc, s) => {
        return { ...acc, [s.status]: (acc[s.status] ?? 0) + 1 };
      }, {});

      const botsByStatus = botsArray.reduce<Record<string, number>>((acc, b) => {
        return { ...acc, [b.status]: (acc[b.status] ?? 0) + 1 };
      }, {});

      return c.json<
        ApiResponse<{
          bots: { total: number; byStatus: Record<string, number> };
          scenes: { total: number; byStatus: Record<string, number> };
          memory: NodeJS.MemoryUsage;
        }>
      >(
        ok({
          bots: { total: this.bots.size, byStatus: botsByStatus },
          scenes: { total: this.scenes.size, byStatus: scenesByStatus },
          memory: process.memoryUsage(),
        }),
      );
    });
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = serve(
        {
          fetch: this.app.fetch,
          port: this.config.port,
          hostname: this.config.host,
        },
        () => {
          resolve();
        },
      );
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server === undefined) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err !== undefined && err !== null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Expose the underlying Hono app for testing (e.g. `app.request()`). */
  get honoApp(): Hono {
    return this.app;
  }
}

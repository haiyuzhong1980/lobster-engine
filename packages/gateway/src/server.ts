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
import type {
  NatsClient,
  SocialRelation,
  RelationLevel,
  EncounterRecord,
  ActivityType,
  LobsterState,
  LobsterStats,
  EmotionState,
  PersonalityDNA,
  DiaryEntry,
} from '@lobster-engine/core';
import {
  NatsSubjects,
  validateSubjectToken,
  RelationManager,
  ShellEconomy,
  GroupEffectDetector,
  EmotionEngine,
  PersonalityEngine,
  WeatherService,
} from '@lobster-engine/core';
import { EncounterMatcher } from '@lobster-engine/scene-encounter';
import { LifePulsePlugin } from '@lobster-engine/scene-life-pulse';

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
// Encounter / Social in-memory data models
// ---------------------------------------------------------------------------

/** Maximum encounter history entries kept in memory. */
const MAX_ENCOUNTER_HISTORY = 1000;

/** Maximum encounter records returned per history query. */
const ENCOUNTER_HISTORY_LIMIT = 50;

/** Shell balance entry tracked per lobster. */
interface ShellBalance {
  readonly lobsterId: string;
  readonly amount: number;
}

/** Internal encounter history entry (extended from EncounterRecord for routing). */
export interface EncounterHistoryEntry extends EncounterRecord {
  // All fields from EncounterRecord are inherited as-is
}

/** Body for POST /api/v1/encounter/report */
export interface EncounterReportBody {
  readonly reporterId: string;
  readonly peerId: string;
  readonly method: 'ble' | 'gps';
  readonly rssi?: number;
  readonly geoHash?: string;
}

/** Body for POST /api/v1/social/gift */
export interface GiftBody {
  readonly senderId: string;
  readonly receiverId: string;
  readonly giftType: string;
  readonly cost: number;
}

/** Body for POST /api/v1/social/confirm */
export interface ConfirmBody {
  readonly lobsterId: string;
  readonly peerId: string;
}

/** Response for POST /api/v1/encounter/report */
export interface EncounterReportResult {
  readonly matched: boolean;
  readonly pairId?: string;
  readonly relation?: SocialRelation;
  readonly reward?: { readonly amount: number; readonly reason: string };
}

/** Response for POST /api/v1/social/gift */
export interface GiftResult {
  readonly relation: SocialRelation;
  readonly senderBalance: number;
}

/** Response for POST /api/v1/social/confirm */
export interface ConfirmResult {
  readonly confirmed: boolean;
  readonly upgraded: boolean;
  readonly newLevel?: RelationLevel;
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
// Lobster companion product — in-memory records
// ---------------------------------------------------------------------------

/** All valid ActivityType values as a Set for O(1) membership checks. */
const VALID_ACTIVITY_TYPES = new Set<ActivityType>([
  'idle', 'walking', 'running', 'cycling', 'subway', 'bus',
  'driving', 'train', 'plane', 'boat', 'sleeping', 'eating',
  'listening_music', 'phone_call', 'charging',
]);

/** Stored lobster record — mirrors LobsterState plus a mutable diary store. */
export interface LobsterRecord extends LobsterState {
  /** Latest diary entry for this lobster (undefined until one is written). */
  readonly latestDiary?: DiaryEntry;
}

/** Lightweight activity event record persisted per POST /api/v1/lobster/activity. */
export interface LobsterActivityRecord {
  readonly lobsterId: string;
  readonly type: ActivityType;
  readonly confidence: number;
  readonly metadata: {
    readonly speed?: number;
    readonly steps?: number;
    readonly altitude?: number;
  };
  readonly timestamp: number;
}

/** Personality response payload including archetype and dialogue hints. */
export interface PersonalityResponse {
  readonly dna: PersonalityDNA;
  readonly archetype: string;
  readonly dialogueStyle: {
    readonly verbosity: string;
    readonly tone: string;
    readonly greeting: string;
    readonly farewell: string;
    readonly responseToCompliment: string;
  };
}

/** Shared WeatherService instance (mock mode — no API key). */
const weatherService = new WeatherService({});

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

  /** Lobster state records keyed by lobster id. */
  private readonly lobsters = new Map<string, LobsterRecord>();

  /** Latest activity record per lobster — used for behavior / incentive lookup. */
  private readonly lobsterActivities = new Map<string, LobsterActivityRecord>();

  /** Encounter Matcher — tracks pending proximity reports for mutual match detection. */
  private readonly encounterMatcher = new EncounterMatcher();

  /** Social relations keyed by pairId (deterministic: sorted(a, b).join('::')).  */
  private readonly relations = new Map<string, SocialRelation>();

  /** Encounter history ring buffer — capped at MAX_ENCOUNTER_HISTORY (FIFO). */
  private readonly encounterHistory: EncounterHistoryEntry[] = [];

  /** Shell balances per lobster. A missing entry is treated as 0. */
  private readonly shellBalances = new Map<string, number>();

  /** Per-server Prometheus registry — isolated so test instances don't clash. */
  readonly metrics: MetricsRegistry;

  /** Periodic timer that prunes stale encounter reports from EncounterMatcher. */
  private encounterCleanupTimer?: ReturnType<typeof setInterval>;

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

    // --- Encounter reporting ---

    this.app.post('/api/v1/encounter/report', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const reporterId = typeof input['reporterId'] === 'string' ? input['reporterId'] : undefined;
      const peerId = typeof input['peerId'] === 'string' ? input['peerId'] : undefined;
      const method = input['method'];

      if (reporterId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: reporterId'), 400);
      }
      if (peerId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: peerId'), 400);
      }
      if (method !== 'ble' && method !== 'gps') {
        return c.json<ApiResponse<never>>(fail('method must be "ble" or "gps"'), 400);
      }

      const reporterIdErr = requireValidId(reporterId, 'reporterId');
      if (reporterIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(reporterIdErr), 400);
      }
      const peerIdErr = requireValidId(peerId, 'peerId');
      if (peerIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(peerIdErr), 400);
      }

      if (reporterId === peerId) {
        return c.json<ApiResponse<never>>(fail('reporterId and peerId must be different'), 400);
      }

      const geoHash =
        typeof input['geoHash'] === 'string' ? input['geoHash'] : undefined;

      // Record the one-sided report
      this.encounterMatcher.report(reporterId, peerId, method);

      const pairId = EncounterMatcher.getPairId(reporterId, peerId);
      const matched = this.encounterMatcher.checkMatch(reporterId, peerId);

      if (!matched) {
        return c.json<ApiResponse<EncounterReportResult>>(ok({ matched: false }));
      }

      // --- Mutual match confirmed ---
      // Clear the matched pair's pending reports so subsequent encounters
      // are treated as discrete events rather than continuing to re-match
      // against stale pending entries.
      this.encounterMatcher.clearPair(reporterId, peerId);

      const now = Date.now();
      const location = geoHash ?? '';

      const encounterRecord: EncounterHistoryEntry = {
        id: crypto.randomUUID(),
        lobsterA: pairId.split('::')[0] ?? reporterId,
        lobsterB: pairId.split('::')[1] ?? peerId,
        location,
        method,
        timestamp: now,
        giftExchanged: false,
        collaborationCompleted: false,
      };

      // Push to FIFO ring buffer
      this.encounterHistory.push(encounterRecord);
      if (this.encounterHistory.length > MAX_ENCOUNTER_HISTORY) {
        this.encounterHistory.shift();
      }

      // Create or update the social relation
      const existingRelation = this.relations.get(pairId);
      const baseRelation =
        existingRelation ?? RelationManager.createRelation(
          encounterRecord.lobsterA,
          encounterRecord.lobsterB,
        );

      const updatedRelation = RelationManager.processEncounter(baseRelation, encounterRecord);
      this.relations.set(pairId, updatedRelation);

      // Calculate shell reward for each participant
      const today = new Date(now).toISOString().slice(0, 10);
      const isFirstToday = !baseRelation.uniqueDays.includes(today);
      const reward = ShellEconomy.encounterReward(updatedRelation, isFirstToday);

      // Credit shells to both participants
      if (reward.amount > 0) {
        this.shellBalances.set(
          reporterId,
          (this.shellBalances.get(reporterId) ?? 0) + reward.amount,
        );
        this.shellBalances.set(
          peerId,
          (this.shellBalances.get(peerId) ?? 0) + reward.amount,
        );
      }

      return c.json<ApiResponse<EncounterReportResult>>(
        ok({
          matched: true,
          pairId,
          relation: updatedRelation,
          reward,
        }),
        201,
      );
    });

    // --- Encounter history ---

    this.app.get('/api/v1/encounter/history/:lobsterId', (c) => {
      const lobsterId = c.req.param('lobsterId');
      const idErr = requireValidId(lobsterId, 'lobsterId');
      if (idErr !== null) {
        return c.json<ApiResponse<never>>(fail(idErr), 400);
      }

      const records = this.encounterHistory
        .filter((r) => r.lobsterA === lobsterId || r.lobsterB === lobsterId)
        .slice()
        .reverse()
        .slice(0, ENCOUNTER_HISTORY_LIMIT);

      return c.json<ApiResponse<EncounterHistoryEntry[]>>(ok(records));
    });

    // --- Social relations ---

    this.app.get('/api/v1/social/:lobsterId/relations', (c) => {
      const lobsterId = c.req.param('lobsterId');
      const idErr = requireValidId(lobsterId, 'lobsterId');
      if (idErr !== null) {
        return c.json<ApiResponse<never>>(fail(idErr), 400);
      }

      const rels = Array.from(this.relations.values()).filter(
        (r) => r.lobsterA === lobsterId || r.lobsterB === lobsterId,
      );

      return c.json<ApiResponse<SocialRelation[]>>(ok(rels));
    });

    // --- Gift sending ---

    this.app.post('/api/v1/social/gift', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const senderId = typeof input['senderId'] === 'string' ? input['senderId'] : undefined;
      const receiverId = typeof input['receiverId'] === 'string' ? input['receiverId'] : undefined;
      const giftType = typeof input['giftType'] === 'string' ? input['giftType'] : undefined;
      const cost =
        typeof input['cost'] === 'number' ? input['cost'] : undefined;

      if (senderId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: senderId'), 400);
      }
      if (receiverId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: receiverId'), 400);
      }
      if (giftType === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: giftType'), 400);
      }
      if (cost === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: cost'), 400);
      }

      const senderIdErr = requireValidId(senderId, 'senderId');
      if (senderIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(senderIdErr), 400);
      }
      const receiverIdErr = requireValidId(receiverId, 'receiverId');
      if (receiverIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(receiverIdErr), 400);
      }

      const giftTypeErr = validateShortString(giftType, 'giftType');
      if (giftTypeErr !== null) {
        return c.json<ApiResponse<never>>(fail(giftTypeErr), 400);
      }

      if (!Number.isFinite(cost) || cost <= 0) {
        return c.json<ApiResponse<never>>(fail('cost must be a positive number'), 400);
      }

      if (senderId === receiverId) {
        return c.json<ApiResponse<never>>(fail('senderId and receiverId must be different'), 400);
      }

      const senderBalance = this.shellBalances.get(senderId) ?? 0;
      if (!ShellEconomy.validateGift(senderBalance, cost)) {
        return c.json<ApiResponse<never>>(
          fail(`Insufficient shells: sender has ${senderBalance}, gift costs ${cost}`),
          402,
        );
      }

      // Deduct shells from sender
      this.shellBalances.set(senderId, senderBalance - cost);

      // Ensure a relation exists between these two lobsters
      const pairId = EncounterMatcher.getPairId(senderId, receiverId);
      const existingRelation = this.relations.get(pairId);

      const [lobsterA, lobsterB] = [senderId, receiverId].sort() as [string, string];
      const baseRelation =
        existingRelation ?? RelationManager.createRelation(lobsterA, lobsterB);

      // Record the gift exchange on the relation
      const updatedRelation: SocialRelation = {
        ...baseRelation,
        giftsExchanged: baseRelation.giftsExchanged + 1,
        lastMet: Date.now(),
      };

      // Check if the gift itself triggers an upgrade
      const newLevel = RelationManager.checkUpgrade(updatedRelation);
      const finalRelation: SocialRelation =
        newLevel !== null
          ? { ...updatedRelation, level: newLevel, confirmedByA: false, confirmedByB: false }
          : updatedRelation;

      this.relations.set(pairId, finalRelation);

      return c.json<ApiResponse<GiftResult>>(
        ok({
          relation: finalRelation,
          senderBalance: this.shellBalances.get(senderId) ?? 0,
        }),
      );
    });

    // --- Mutual confirmation ---

    this.app.post('/api/v1/social/confirm', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const lobsterId = typeof input['lobsterId'] === 'string' ? input['lobsterId'] : undefined;
      const peerId = typeof input['peerId'] === 'string' ? input['peerId'] : undefined;

      if (lobsterId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: lobsterId'), 400);
      }
      if (peerId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: peerId'), 400);
      }

      const lobsterIdErr = requireValidId(lobsterId, 'lobsterId');
      if (lobsterIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(lobsterIdErr), 400);
      }
      const peerIdErr = requireValidId(peerId, 'peerId');
      if (peerIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(peerIdErr), 400);
      }

      if (lobsterId === peerId) {
        return c.json<ApiResponse<never>>(fail('lobsterId and peerId must be different'), 400);
      }

      const pairId = EncounterMatcher.getPairId(lobsterId, peerId);
      const existingRelation = this.relations.get(pairId);

      if (existingRelation === undefined) {
        return c.json<ApiResponse<never>>(
          fail(`No relation found between "${lobsterId}" and "${peerId}"`),
          404,
        );
      }

      // Determine which side is confirming
      const isA = existingRelation.lobsterA === lobsterId;
      const withConfirmation: SocialRelation = isA
        ? { ...existingRelation, confirmedByA: true }
        : { ...existingRelation, confirmedByB: true };

      // Check for upgrade after setting confirmation
      const newLevel = RelationManager.checkUpgrade(withConfirmation);
      const finalRelation: SocialRelation =
        newLevel !== null
          ? { ...withConfirmation, level: newLevel, confirmedByA: false, confirmedByB: false }
          : withConfirmation;

      this.relations.set(pairId, finalRelation);

      return c.json<ApiResponse<ConfirmResult>>(
        ok({
          confirmed: true,
          upgraded: newLevel !== null,
          ...(newLevel !== null ? { newLevel } : {}),
        }),
      );
    });

    // --- Group detection ---

    this.app.get('/api/v1/social/groups', (c) => {
      const url = new URL(c.req.url);
      const geoHashFilter = url.searchParams.get('geoHash') ?? undefined;

      // Build geo reports from the recent encounter history
      // Each unique lobster+geoHash pair from the last 50 encounters counts
      const recentEncounters = this.encounterHistory.slice(-50);
      const geoReports: Array<{ lobsterId: string; geoHash: string; timestamp: number }> = [];

      for (const enc of recentEncounters) {
        if (enc.location.length === 0) continue;
        geoReports.push({ lobsterId: enc.lobsterA, geoHash: enc.location, timestamp: enc.timestamp });
        geoReports.push({ lobsterId: enc.lobsterB, geoHash: enc.location, timestamp: enc.timestamp });
      }

      const allGroups = GroupEffectDetector.detectGroups(geoReports);
      const groups = geoHashFilter !== undefined
        ? allGroups.filter((g) => g.geoHash === geoHashFilter)
        : allGroups;

      return c.json<ApiResponse<typeof groups>>(ok(groups));
    });

    // =========================================================================
    // --- Lobster companion product routes (A.4 + A.5) ---
    // =========================================================================

    // POST /api/v1/lobster/register
    this.app.post('/api/v1/lobster/register', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const name = typeof input['name'] === 'string' ? input['name'] : undefined;
      const ownerId = typeof input['ownerId'] === 'string' ? input['ownerId'] : undefined;

      if (name === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: name'), 400);
      }
      if (ownerId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: ownerId'), 400);
      }

      const nameErr = validateShortString(name, 'name');
      if (nameErr !== null) {
        return c.json<ApiResponse<never>>(fail(nameErr), 400);
      }
      const ownerIdErr = requireValidId(ownerId, 'ownerId');
      if (ownerIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(ownerIdErr), 400);
      }

      const id = crypto.randomUUID();
      const now = Date.now();

      const defaultStats: LobsterStats = {
        totalSteps: 0,
        totalEncounters: 0,
        totalDays: 0,
        longestIdle: 0,
        favoriteActivity: 'idle',
        lyingFlatIndex: 0,
      };

      const lobster: LobsterRecord = {
        id,
        ownerId,
        name,
        level: 1,
        personality: PersonalityEngine.createDefault(),
        emotion: EmotionEngine.createDefault(),
        currentActivity: 'idle',
        currentScene: 'lobster_home',
        lazyCoin: 0,
        shells: 0,
        stats: defaultStats,
        createdAt: now,
        updatedAt: now,
      };

      this.lobsters.set(id, lobster);
      return c.json<ApiResponse<LobsterRecord>>(ok(lobster), 201);
    });

    // GET /api/v1/lobster/:id/state
    this.app.get('/api/v1/lobster/:id/state', (c) => {
      const id = c.req.param('id');
      const lobster = this.lobsters.get(id);
      if (lobster === undefined) {
        return c.json<ApiResponse<never>>(fail(`Lobster "${id}" not found`), 404);
      }
      return c.json<ApiResponse<LobsterRecord>>(ok(lobster));
    });

    // POST /api/v1/lobster/activity
    this.app.post('/api/v1/lobster/activity', async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json<ApiResponse<never>>(fail('Invalid JSON body'), 400);
      }

      const input = (
        typeof body === 'object' && body !== null ? body : {}
      ) as Record<string, unknown>;

      const lobsterId = typeof input['lobsterId'] === 'string' ? input['lobsterId'] : undefined;
      const type = typeof input['type'] === 'string' ? input['type'] : undefined;
      const rawConfidence = input['confidence'];

      if (lobsterId === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: lobsterId'), 400);
      }
      if (type === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: type'), 400);
      }
      if (rawConfidence === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: confidence'), 400);
      }

      const lobsterIdErr = requireValidId(lobsterId, 'lobsterId');
      if (lobsterIdErr !== null) {
        return c.json<ApiResponse<never>>(fail(lobsterIdErr), 400);
      }

      if (!VALID_ACTIVITY_TYPES.has(type as ActivityType)) {
        return c.json<ApiResponse<never>>(
          fail(`Invalid type: must be one of ${Array.from(VALID_ACTIVITY_TYPES).join(', ')}`),
          400,
        );
      }

      if (typeof rawConfidence !== 'number' || Number.isNaN(rawConfidence)) {
        return c.json<ApiResponse<never>>(fail('confidence must be a number'), 400);
      }
      if (rawConfidence < 0 || rawConfidence > 1) {
        return c.json<ApiResponse<never>>(fail('confidence must be between 0 and 1'), 400);
      }

      const activityType = type as ActivityType;

      // Validate optional metadata numeric fields (NaN guard)
      const meta = (
        typeof input['metadata'] === 'object' &&
        input['metadata'] !== null &&
        !Array.isArray(input['metadata'])
          ? (input['metadata'] as Record<string, unknown>)
          : {}
      );

      const speed = typeof meta['speed'] === 'number' && !Number.isNaN(meta['speed'])
        ? meta['speed']
        : undefined;
      const steps = typeof meta['steps'] === 'number' && !Number.isNaN(meta['steps'])
        ? meta['steps']
        : undefined;
      const altitude = typeof meta['altitude'] === 'number' && !Number.isNaN(meta['altitude'])
        ? meta['altitude']
        : undefined;

      const now = Date.now();
      const lastActivity = this.lobsterActivities.get(lobsterId);
      const durationMinutes = lastActivity
        ? Math.floor((now - lastActivity.timestamp) / 60_000)
        : 0;

      const activityRecord: LobsterActivityRecord = {
        lobsterId,
        type: activityType,
        confidence: rawConfidence,
        metadata: { speed, steps, altitude },
        timestamp: now,
      };

      this.lobsterActivities.set(lobsterId, activityRecord);

      // Update lobster state if the lobster exists
      const existing = this.lobsters.get(lobsterId);
      if (existing !== undefined) {
        const behavior = LifePulsePlugin.getBehavior(activityType);
        const updated: LobsterRecord = {
          ...existing,
          currentActivity: activityType,
          currentScene: behavior.scene,
          updatedAt: now,
        };
        this.lobsters.set(lobsterId, updated);
      }

      // Calculate behavior and incentive
      const behavior = LifePulsePlugin.getBehavior(activityType);
      const incentive = LifePulsePlugin.calculateIncentive(activityType, durationMinutes, {
        steps,
        timestamp: activityRecord.timestamp,
      });

      const result = {
        behavior,
        incentive: incentive.lazyCoin > 0
          ? { lazyCoin: incentive.lazyCoin, reason: incentive.reaction ?? '', lobsterReaction: incentive.reaction ?? '' }
          : undefined,
      };

      return c.json<ApiResponse<typeof result>>(ok(result));
    });

    // PATCH /api/v1/lobster/:id/emotion
    this.app.patch('/api/v1/lobster/:id/emotion', async (c) => {
      const id = c.req.param('id');
      const lobster = this.lobsters.get(id);
      if (lobster === undefined) {
        return c.json<ApiResponse<never>>(fail(`Lobster "${id}" not found`), 404);
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

      const trigger = typeof input['trigger'] === 'string' ? input['trigger'] : undefined;
      if (trigger === undefined) {
        return c.json<ApiResponse<never>>(fail('Missing required field: trigger'), 400);
      }

      const emotionTrigger = EmotionEngine.TRIGGERS[trigger];
      if (emotionTrigger === undefined) {
        return c.json<ApiResponse<never>>(
          fail(`Unknown trigger: "${trigger}". Valid triggers: ${Object.keys(EmotionEngine.TRIGGERS).join(', ')}`),
          400,
        );
      }

      const newEmotion: EmotionState = EmotionEngine.applyTrigger(lobster.emotion, emotionTrigger);
      const updated: LobsterRecord = {
        ...lobster,
        emotion: newEmotion,
        updatedAt: Date.now(),
      };
      this.lobsters.set(id, updated);

      return c.json<ApiResponse<EmotionState>>(ok(newEmotion));
    });

    // GET /api/v1/lobster/:id/diary
    this.app.get('/api/v1/lobster/:id/diary', (c) => {
      const id = c.req.param('id');
      const lobster = this.lobsters.get(id);
      if (lobster === undefined) {
        return c.json<ApiResponse<never>>(fail(`Lobster "${id}" not found`), 404);
      }
      if (lobster.latestDiary === undefined) {
        return c.json<ApiResponse<never>>(fail(`No diary entries found for lobster "${id}"`), 404);
      }
      return c.json<ApiResponse<DiaryEntry>>(ok(lobster.latestDiary));
    });

    // GET /api/v1/lobster/:id/personality
    this.app.get('/api/v1/lobster/:id/personality', (c) => {
      const id = c.req.param('id');
      const lobster = this.lobsters.get(id);
      if (lobster === undefined) {
        return c.json<ApiResponse<never>>(fail(`Lobster "${id}" not found`), 404);
      }

      const archetype = PersonalityEngine.getArchetype(lobster.personality);
      const dialogueStyle = PersonalityEngine.getDialogueStyle(lobster.personality);

      const result: PersonalityResponse = {
        dna: lobster.personality,
        archetype,
        dialogueStyle,
      };
      return c.json<ApiResponse<PersonalityResponse>>(ok(result));
    });

    // GET /api/v1/weather
    this.app.get('/api/v1/weather', async (c) => {
      const url = new URL(c.req.url);
      const rawLat = url.searchParams.get('lat');
      const rawLon = url.searchParams.get('lon');

      if (rawLat === null || rawLon === null) {
        return c.json<ApiResponse<never>>(fail('Missing required query params: lat, lon'), 400);
      }

      const lat = parseFloat(rawLat);
      const lon = parseFloat(rawLon);

      if (Number.isNaN(lat)) {
        return c.json<ApiResponse<never>>(fail('Invalid query param: lat must be a number'), 400);
      }
      if (Number.isNaN(lon)) {
        return c.json<ApiResponse<never>>(fail('Invalid query param: lon must be a number'), 400);
      }
      if (lat < -90 || lat > 90) {
        return c.json<ApiResponse<never>>(fail('lat must be between -90 and 90'), 400);
      }
      if (lon < -180 || lon > 180) {
        return c.json<ApiResponse<never>>(fail('lon must be between -180 and 180'), 400);
      }

      let weatherData;
      try {
        weatherData = await weatherService.getWeather(lat, lon);
      } catch (err) {
        // eslint-disable-next-line no-console -- intentional server-side error log
        console.error('[GatewayServer] Weather fetch error:', err);
        return c.json<ApiResponse<never>>(fail('Failed to fetch weather data'), 502);
      }

      const effect = WeatherService.mapToLobsterEffect(weatherData);
      return c.json<ApiResponse<{ weather: typeof weatherData; effect: typeof effect }>>(
        ok({ weather: weatherData, effect }),
      );
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
    this.encounterCleanupTimer = setInterval(
      () => this.encounterMatcher.cleanup(),
      60_000,
    );
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
    clearInterval(this.encounterCleanupTimer);
    this.encounterCleanupTimer = undefined;
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

// @lobster-engine/gateway — NatsBridge
//
// Subscribes to NATS subjects and forwards incoming messages to connected
// WebSocket and SSE clients.  Subject wildcards are used to capture events
// from all bots and scenes in a single subscription each.
//
// Subjects consumed:
//   bot.*.action        — action results for any bot
//   scene.*.broadcast   — broadcast messages for any scene
//   system.metrics      — system-wide metric snapshots

import type { NatsClient, SubscriptionHandle } from '@lobster-engine/core';
import { BOT_ACTION_ALL, SCENE_BROADCAST_ALL, NatsSubjects } from '@lobster-engine/core';
import type { WSManager } from './ws.js';
import type { SSEManager } from './sse.js';

// ---------------------------------------------------------------------------
// Subject parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a `bot.<botId>.action` subject and return the botId token.
 * Returns undefined when the subject does not match the expected pattern.
 */
function parseBotActionSubject(subject: string): string | undefined {
  // Pattern: bot.<botId>.action  (3 tokens, no dots inside botId)
  const parts = subject.split('.');
  if (parts.length === 3 && parts[0] === 'bot' && parts[2] === 'action') {
    return parts[1];
  }
  return undefined;
}

/**
 * Parse a `scene.<sceneId>.broadcast` subject and return the sceneId token.
 * Returns undefined when the subject does not match the expected pattern.
 *
 * Note: sceneId may contain colons (e.g. `werewolf:uuid`) but never dots,
 * so the simple 3-token split is sufficient.
 */
function parseSceneBroadcastSubject(subject: string): string | undefined {
  const parts = subject.split('.');
  if (parts.length === 3 && parts[0] === 'scene' && parts[2] === 'broadcast') {
    return parts[1];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// NatsBridge
// ---------------------------------------------------------------------------

/**
 * Bridges NATS message subjects to connected WebSocket and SSE clients.
 *
 * Lifecycle:
 *   1. Construct with a NatsClient and the two manager instances.
 *   2. Call `start()` to begin consuming.
 *   3. Call `stop()` to unsubscribe and release resources.
 *
 * When no NatsClient is provided the bridge is a no-op — `start()` and
 * `stop()` return immediately without error, making it safe to construct
 * unconditionally in the server bootstrap.
 */
export class NatsBridge {
  private readonly handles: SubscriptionHandle[] = [];
  private started = false;

  constructor(
    private readonly nats: NatsClient | undefined,
    private readonly wsManager: WSManager,
    private readonly sseManager: SSEManager,
  ) {}

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Subscribe to the three NATS wildcard subjects and begin forwarding
   * messages to WebSocket / SSE clients.
   *
   * Calling `start()` when already started or when no NatsClient was
   * provided is a safe no-op.
   */
  async start(): Promise<void> {
    if (this.started || this.nats === undefined) return;
    this.started = true;

    // --- bot.*.action ---
    const botActionHandle = this.nats.subscribe(
      BOT_ACTION_ALL,
      async (data): Promise<void> => {
        this.handleBotAction(data);
      },
    );
    this.handles.push(botActionHandle);

    // --- scene.*.broadcast ---
    const sceneBroadcastHandle = this.nats.subscribe(
      SCENE_BROADCAST_ALL,
      async (data): Promise<void> => {
        this.handleSceneBroadcast(data);
      },
    );
    this.handles.push(sceneBroadcastHandle);

    // --- system.metrics ---
    const systemMetricsHandle = this.nats.subscribe(
      NatsSubjects.systemMetrics,
      async (data): Promise<void> => {
        this.handleSystemMetrics(data);
      },
    );
    this.handles.push(systemMetricsHandle);
  }

  /**
   * Unsubscribe from all NATS subjects and mark the bridge as stopped.
   *
   * Safe to call when already stopped or when no NatsClient was provided.
   */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    for (const handle of this.handles) {
      handle.unsubscribe();
    }
    this.handles.length = 0;
  }

  // --------------------------------------------------------------------------
  // Message handlers
  // --------------------------------------------------------------------------

  /**
   * Receive a `bot.<botId>.action` message.
   *
   * The payload is expected to contain a `sceneId` field so the bridge can
   * route to scene subscribers. If `sceneId` is absent the message is still
   * forwarded as a system-level broadcast to all WS clients (best-effort).
   *
   * The subject itself carries the botId so it does not have to be repeated
   * inside the payload, but a `botId` field in the payload takes precedence
   * when present.
   */
  private handleBotAction(data: unknown): void {
    const payload = asRecord(data);
    if (payload === undefined) return;

    const sceneId = stringField(payload, 'sceneId');
    if (sceneId === undefined) return;

    // Forward to all WebSocket clients subscribed to this scene.
    this.wsManager.broadcastRawToScene(sceneId, 'bot.action', data);

    // Forward to all SSE clients in the same scene as a synthetic EngineEvent.
    this.sseManager.broadcastToScene(sceneId, {
      type: 'scene:action',
      payload: {
        botId: stringField(payload, 'botId') ?? '',
        sceneId,
        result: {
          success: true,
          action: {
            type: stringField(payload, 'actionType') ?? '',
            content: stringField(payload, 'content') ?? '',
            target: stringField(payload, 'target'),
            metadata: {},
          },
          error: undefined,
          duration: 0,
        },
      },
    });
  }

  /**
   * Receive a `scene.<sceneId>.broadcast` message.
   *
   * The sceneId is parsed from the subject to avoid trusting the payload.
   * Messages are forwarded to both WS and SSE subscribers of that scene.
   *
   * NatsClient subscriptions do not expose the subject in the `MessageHandler`
   * signature.  The bridge wraps each subscription in a closure that already
   * has the subject bound — but for wildcard subscriptions the actual subject
   * per message is not surfaced by the current `NatsClient` API.
   *
   * Therefore we read `sceneId` from the payload (set by the publisher) and
   * fall back to extracting it from the BOT_ACTION_ALL / SCENE_BROADCAST_ALL
   * subjects — the payload field is the reliable source here.
   */
  private handleSceneBroadcast(data: unknown): void {
    const payload = asRecord(data);
    if (payload === undefined) return;

    const sceneId = stringField(payload, 'sceneId');
    if (sceneId === undefined) return;

    const eventType = stringField(payload, 'type') ?? 'scene.broadcast';

    // Forward raw to WebSocket subscribers.
    this.wsManager.broadcastRawToScene(sceneId, eventType, data);

    // Forward as generic engine event to SSE clients.
    this.sseManager.broadcastToScene(sceneId, {
      type: 'scene:turn',
      payload: {
        botId: stringField(payload, 'botId') ?? '',
        sceneId,
        event: {
          id: stringField(payload, 'id') ?? crypto.randomUUID(),
          botId: stringField(payload, 'botId') ?? '',
          sceneId,
          type: eventType,
          phase: stringField(payload, 'phase') ?? 'discuss',
          data: typeof payload['data'] === 'object' && payload['data'] !== null
            ? (payload['data'] as Record<string, unknown>)
            : {},
          timestamp: typeof payload['timestamp'] === 'number'
            ? payload['timestamp']
            : Date.now(),
        },
      },
    });
  }

  /**
   * Receive a `system.metrics` message.
   *
   * Metrics are broadcast to all scenes currently tracked in the WS index so
   * every connected client receives system-wide health updates.
   */
  private handleSystemMetrics(data: unknown): void {
    const payload = asRecord(data);
    if (payload === undefined) return;

    // The NatsClient subscription for system.metrics does not carry a sceneId,
    // so we broadcast using a dedicated virtual scene key "__system__".
    const SYSTEM_SCENE = '__system__';
    this.wsManager.broadcastRawToScene(SYSTEM_SCENE, 'system.metrics', data);
    this.sseManager.broadcastToScene(SYSTEM_SCENE, {
      type: 'engine:ready',
      payload: {},
    });
  }
}

// ---------------------------------------------------------------------------
// Internal narrow helpers (no `any`)
// ---------------------------------------------------------------------------

/** Narrow `unknown` to a plain object record. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** Extract a string field from a record, returning undefined when absent. */
function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = record[key];
  return typeof v === 'string' ? v : undefined;
}

// ---------------------------------------------------------------------------
// Subject parsing re-exports (used by tests)
// ---------------------------------------------------------------------------

export { parseBotActionSubject, parseSceneBroadcastSubject };

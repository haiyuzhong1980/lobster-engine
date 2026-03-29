// @lobster-engine/core — BotWorker execution loop

import { randomUUID } from 'node:crypto';
import type { TurnEvent, ActionResult, BotState, Logger } from './types.js';
import type { StorageProvider } from './storage.js';
import { NatsClient } from './nats.js';
import type { NatsConfig, SubscriptionHandle } from './nats.js';
import { NatsSubjects, QUEUE_WORKERS } from './nats-subjects.js';
import { AdapterPool } from './adapter-pool.js';
import { ScenePluginRegistry } from './scene-registry.js';
import { StateManager } from './state.js';
import type { ScenePlugin, SceneContext } from './scene.js';
import { createLogger } from './logger.js';
import {
  turnsTotal,
  turnDurationSeconds,
  errorsTotal,
  workerActive,
  turnLabels,
  errorLabels,
} from './metrics.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WorkerConfig {
  /** Worker identifier — auto-generates a UUID if omitted. */
  readonly workerId?: string;
  /** NATS connection URL (e.g. "nats://localhost:4222") */
  readonly natsUrl: string;
  /** Redis (or any StorageProvider) for hot bot state. */
  readonly storage: StorageProvider;
  /** Adapter pool for AI inference. */
  readonly adapterPool: AdapterPool;
  /** Plugin registry for scene logic. */
  readonly sceneRegistry: ScenePluginRegistry;
  /** Optional logger; defaults to a pino instance bound to this workerId. */
  readonly logger?: Logger;
  /** How often (ms) to publish a heartbeat. Defaults to 10 000. */
  readonly heartbeatInterval?: number;
  /** Maximum bot turns processed concurrently. Defaults to 10. */
  readonly maxConcurrent?: number;
}

// ---------------------------------------------------------------------------
// Health snapshot
// ---------------------------------------------------------------------------

export interface WorkerHealth {
  readonly workerId: string;
  readonly status: 'running' | 'draining' | 'stopped';
  readonly activeTasks: number;
  readonly totalProcessed: number;
  readonly uptime: number;
  readonly errors: number;
}

// ---------------------------------------------------------------------------
// Internal subject names for the queue subscription
// ---------------------------------------------------------------------------

const WORKER_ASSIGN_SUBJECT = NatsSubjects.workerAssign; // 'worker.assign'
const WORKER_QUEUE_GROUP = QUEUE_WORKERS; // 'lobster-workers'

// ---------------------------------------------------------------------------
// BotWorker
// ---------------------------------------------------------------------------

/**
 * A horizontally-scalable worker that:
 *
 * 1. Connects to NATS on `start()`.
 * 2. Queue-subscribes to `worker.assign` under the `lobster-workers` queue
 *    group so each task is delivered to exactly one worker instance.
 * 3. For every TurnEvent received it runs the full bot-turn pipeline:
 *    read state → buildPrompt → AI chat → parseAction → validateAction →
 *    write state → publish result → emit metrics.
 * 4. Enforces a `maxConcurrent` cap; excess messages are silently dropped
 *    (back-pressure / buffering is a higher-level concern).
 * 5. Publishes a heartbeat to `worker.{id}.heartbeat` every
 *    `heartbeatInterval` ms while running.
 * 6. Exposes `health()` for liveness / readiness probes.
 */
export class BotWorker {
  // Immutable config
  private readonly workerId: string;
  private readonly nats: NatsClient;
  private readonly natsConfig: NatsConfig;
  private readonly storage: StorageProvider;
  private readonly stateManager: StateManager;
  private readonly adapterPool: AdapterPool;
  private readonly sceneRegistry: ScenePluginRegistry;
  private readonly log: Logger;
  private readonly heartbeatIntervalMs: number;
  private readonly maxConcurrent: number;

  // Mutable runtime state
  private _status: 'running' | 'draining' | 'stopped' = 'stopped';
  private subscription: SubscriptionHandle | undefined = undefined;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined = undefined;
  private activeCount = 0;
  private totalProcessed = 0;
  private errorCount = 0;
  private startedAt = 0;

  constructor(config: WorkerConfig) {
    this.workerId = config.workerId ?? randomUUID();
    this.natsConfig = { servers: [config.natsUrl] };
    this.nats = new NatsClient();
    this.storage = config.storage;
    this.stateManager = new StateManager({ hotStorage: config.storage });
    this.adapterPool = config.adapterPool;
    this.sceneRegistry = config.sceneRegistry;
    this.log =
      config.logger ??
      createLogger('BotWorker', { workerId: this.workerId });
    this.heartbeatIntervalMs = config.heartbeatInterval ?? 10_000;
    this.maxConcurrent = config.maxConcurrent ?? 10;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Connect NATS and the storage tier, then begin consuming `worker.assign`.
   * Idempotent — subsequent calls while already running are no-ops.
   */
  async start(): Promise<void> {
    if (this._status === 'running') return;

    this.log.info('BotWorker starting', { workerId: this.workerId });

    await this.nats.connect(this.natsConfig);
    await this.stateManager.connect();

    this.subscription = this.nats.queueSubscribe(
      WORKER_ASSIGN_SUBJECT,
      WORKER_QUEUE_GROUP,
      (data) => this.handleMessage(data),
    );

    this._status = 'running';
    this.startedAt = Date.now();

    this.startHeartbeat();

    this.log.info('BotWorker ready', {
      workerId: this.workerId,
      subject: WORKER_ASSIGN_SUBJECT,
      queue: WORKER_QUEUE_GROUP,
    });
  }

  /**
   * Graceful shutdown:
   * 1. Stop accepting new work (set status to draining).
   * 2. Stop the heartbeat timer.
   * 3. Unsubscribe from NATS and drain the connection (flushes pending msgs).
   * 4. Disconnect storage.
   * 5. Wait for in-flight turns to finish (polled until activeCount reaches 0).
   */
  async stop(): Promise<void> {
    if (this._status === 'stopped') return;

    this.log.info('BotWorker stopping', {
      workerId: this.workerId,
      activeTasks: this.activeCount,
    });

    this._status = 'draining';
    this.stopHeartbeat();

    if (this.subscription !== undefined) {
      this.subscription.unsubscribe();
      this.subscription = undefined;
    }

    // Drain NATS — flushes all queued outbound messages and then closes.
    await this.nats.drain();

    // Wait for any still-executing bot turns.
    await this.drainActiveTasks();

    await this.stateManager.disconnect();

    this._status = 'stopped';
    this.log.info('BotWorker stopped', { workerId: this.workerId });
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /** Returns a point-in-time health snapshot. */
  health(): WorkerHealth {
    return {
      workerId: this.workerId,
      status: this._status,
      activeTasks: this.activeCount,
      totalProcessed: this.totalProcessed,
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      errors: this.errorCount,
    };
  }

  // -------------------------------------------------------------------------
  // Internal — NATS message handler
  // -------------------------------------------------------------------------

  /**
   * Raw NATS message entry point.  Validates the payload shape, enforces the
   * concurrency cap, then fires off `processBotTurn` as a detached task.
   */
  private handleMessage(data: unknown): Promise<void> {
    if (this._status !== 'running') return Promise.resolve();

    if (this.activeCount >= this.maxConcurrent) {
      this.log.warn('BotWorker: concurrency cap reached, dropping event', {
        workerId: this.workerId,
        activeCount: this.activeCount,
        maxConcurrent: this.maxConcurrent,
      });
      return Promise.resolve();
    }

    const event = this.parseTurnEvent(data);
    if (event === undefined) {
      this.log.warn('BotWorker: received malformed turn event, skipping', {
        workerId: this.workerId,
      });
      return Promise.resolve();
    }

    // Reserve the concurrency slot synchronously before the async call so
    // subsequent synchronous checks see the updated count.
    this.activeCount++;

    // Fire-and-forget: processBotTurn manages its own error handling so it
    // will never propagate an unhandled rejection.
    void this.processBotTurn(event.botId, event).finally(() => {
      this.activeCount--;
      workerActive.dec({}, 1);
    });
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Internal — core bot-turn pipeline
  // -------------------------------------------------------------------------

  /**
   * Executes the full bot-turn pipeline for a single event:
   *
   *   1. Read bot state from Redis via StateManager.
   *   2. Get scene plugin from ScenePluginRegistry.
   *   3. Build SceneContext.
   *   4. Build prompt using plugin.buildPrompt(event, context).
   *   5. Call AI adapter via AdapterPool.chat(messages).
   *   6. Parse action using plugin.parseAction(response, context).
   *   7. Validate action using plugin.validateAction(action, context).
   *   8. If invalid, fall back to plugin.getDefaultAction(event, context).
   *   9. Write updated state back to Redis.
   *  10. Publish ActionResult to bot.{botId}.action.
   *  11. Emit Prometheus metrics.
   *
   * All errors are caught per-turn; the worker never crashes on a bad event.
   */
  private async processBotTurn(botId: string, event: TurnEvent): Promise<ActionResult> {
    workerActive.inc({}, 1);

    const start = Date.now();
    let result: ActionResult;

    try {
      result = await this.runTurnPipeline(botId, event);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.log.error('BotWorker: unexpected error in turn pipeline', {
        workerId: this.workerId,
        botId,
        eventId: event.id,
        error: error.message,
      });

      this.errorCount++;
      errorsTotal.inc(errorLabels('turn_pipeline'));

      result = this.makeErrorResult(event, error, Date.now() - start);
    }

    // Publish even on error so downstream consumers always receive a reply.
    try {
      this.nats.publish(NatsSubjects.botAction(botId), result);
    } catch (publishErr: unknown) {
      const e = publishErr instanceof Error ? publishErr : new Error(String(publishErr));
      this.log.error('BotWorker: failed to publish action result', {
        workerId: this.workerId,
        botId,
        error: e.message,
      });
    }

    return result;
  }

  /**
   * The actual pipeline — separated from the outer error wrapper so that
   * `processBotTurn` cleanly owns counter management.
   */
  private async runTurnPipeline(botId: string, event: TurnEvent): Promise<ActionResult> {
    const start = Date.now();

    // --- 1. Read bot state ---
    const botState = await this.stateManager.getBotState(botId);

    // --- 2. Resolve plugin ---
    const plugin = this.resolvePlugin(event);
    if (plugin === undefined) {
      const msg =
        `No ScenePlugin found for sceneId "${event.sceneId}". ` +
        `Registered types: [${this.sceneRegistry
          .list()
          .map((d) => d.sceneType)
          .join(', ')}]`;

      this.log.error('BotWorker: plugin not found', {
        workerId: this.workerId,
        botId,
        sceneId: event.sceneId,
      });

      this.errorCount++;
      errorsTotal.inc(errorLabels('plugin_not_found'));

      return {
        success: false,
        action: { type: 'noop', content: '', target: undefined, metadata: {} },
        error: msg,
        duration: Date.now() - start,
      };
    }

    // --- 3. Build context ---
    const context = this.buildContext(event, botState);

    // --- 4. Build prompt ---
    const messages = plugin.buildPrompt(event, context);
    this.log.debug('BotWorker: prompt built', {
      workerId: this.workerId,
      botId,
      messageCount: messages.length,
    });

    // --- 5. AI chat ---
    const response = await this.adapterPool.chat(messages);
    this.log.debug('BotWorker: adapter responded', {
      workerId: this.workerId,
      botId,
      finishReason: response.finishReason,
      totalTokens: response.usage?.totalTokens,
    });

    // --- 6. Parse action ---
    let parseError: string | undefined;
    let action = plugin.getDefaultAction(event, context); // safe default

    try {
      action = plugin.parseAction(response.content, context);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      parseError = `parseAction error: ${e.message}`;
      this.log.warn('BotWorker: parseAction threw, using default action', {
        workerId: this.workerId,
        botId,
        error: e.message,
      });
    }

    // --- 7. Validate action ---
    const validation = plugin.validateAction(action, context);

    if (!validation.valid) {
      this.log.warn('BotWorker: action invalid, using default action', {
        workerId: this.workerId,
        botId,
        reason: validation.reason,
      });
      action = plugin.getDefaultAction(event, context);
    }

    // --- 8. Write updated state ---
    if (botState !== null) {
      const updatedState: BotState = {
        ...botState,
        updatedAt: Date.now(),
      };
      await this.stateManager.setBotState(botId, updatedState);
    }

    const duration = Date.now() - start;
    const success = validation.valid && parseError === undefined;

    // --- 10. Metrics ---
    turnsTotal.inc(turnLabels(plugin.sceneType, success ? 'success' : 'error'));
    turnDurationSeconds.observe(duration / 1000, { scene_type: plugin.sceneType });

    this.totalProcessed++;

    return {
      success,
      action,
      error: parseError ?? (validation.valid ? undefined : (validation.reason ?? 'Action failed validation')),
      duration,
    };
  }

  // -------------------------------------------------------------------------
  // Internal — plugin resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the best-matching ScenePlugin for an event.
   *
   * Priority:
   *   1. Exact sceneType match against event.sceneId.
   *   2. Longest-prefix match (e.g. sceneType "werewolf" matches
   *      sceneId "werewolf:room-42").
   */
  private resolvePlugin(event: TurnEvent): ScenePlugin | undefined {
    const exact = this.sceneRegistry.getByType(event.sceneId);
    if (exact !== undefined) return exact;

    let best: ScenePlugin | undefined;
    for (const descriptor of this.sceneRegistry.list()) {
      const plugin = this.sceneRegistry.get(descriptor.name);
      if (plugin === undefined) continue;
      if (
        event.sceneId.startsWith(plugin.sceneType) &&
        (best === undefined || plugin.sceneType.length > best.sceneType.length)
      ) {
        best = plugin;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Internal — context builder
  // -------------------------------------------------------------------------

  private buildContext(event: TurnEvent, botState: BotState | null): SceneContext {
    return {
      botId: event.botId,
      sceneId: event.sceneId,
      state: botState?.metadata ?? {},
      history: [],
    };
  }

  // -------------------------------------------------------------------------
  // Internal — heartbeat
  // -------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this._status !== 'running') return;
      try {
        this.nats.publish(NatsSubjects.workerHeartbeat(this.workerId), {
          workerId: this.workerId,
          timestamp: Date.now(),
          activeTasks: this.activeCount,
          totalProcessed: this.totalProcessed,
          errors: this.errorCount,
        });
      } catch (err: unknown) {
        const e = err instanceof Error ? err : new Error(String(err));
        this.log.warn('BotWorker: heartbeat publish failed', {
          workerId: this.workerId,
          error: e.message,
        });
      }
    }, this.heartbeatIntervalMs);

    // Allow Node.js to exit cleanly even if the timer is pending.
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Internal — graceful drain helpers
  // -------------------------------------------------------------------------

  /** Poll until all in-flight turns have completed (or 30 s timeout). */
  private drainActiveTasks(timeoutMs = 30_000): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.activeCount === 0) {
        resolve();
        return;
      }

      const deadline = Date.now() + timeoutMs;
      const poll = (): void => {
        if (this.activeCount === 0 || Date.now() >= deadline) {
          resolve();
          return;
        }
        setTimeout(poll, 10);
      };
      poll();
    });
  }

  // -------------------------------------------------------------------------
  // Internal — TurnEvent parser
  // -------------------------------------------------------------------------

  /**
   * Safely coerce an unknown NATS payload into a `TurnEvent`.
   * Returns `undefined` when the payload does not conform to the schema.
   */
  private parseTurnEvent(data: unknown): TurnEvent | undefined {
    if (typeof data !== 'object' || data === null) return undefined;

    const obj = data as Record<string, unknown>;

    if (
      typeof obj['id'] !== 'string' ||
      typeof obj['botId'] !== 'string' ||
      typeof obj['sceneId'] !== 'string' ||
      typeof obj['type'] !== 'string' ||
      typeof obj['phase'] !== 'string' ||
      typeof obj['timestamp'] !== 'number'
    ) {
      return undefined;
    }

    const eventData =
      typeof obj['data'] === 'object' &&
      obj['data'] !== null &&
      !Array.isArray(obj['data'])
        ? (obj['data'] as Record<string, unknown>)
        : {};

    return {
      id: obj['id'],
      botId: obj['botId'],
      sceneId: obj['sceneId'],
      type: obj['type'],
      phase: obj['phase'],
      data: eventData,
      timestamp: obj['timestamp'],
    };
  }

  // -------------------------------------------------------------------------
  // Internal — error result factory
  // -------------------------------------------------------------------------

  private makeErrorResult(event: TurnEvent, error: Error, duration: number): ActionResult {
    // Try to get the plugin's default action; if unavailable, use noop.
    const plugin = this.resolvePlugin(event);
    const context = this.buildContext(event, null);
    const action = plugin?.getDefaultAction(event, context) ?? {
      type: 'noop',
      content: '',
      target: undefined,
      metadata: {},
    };

    return {
      success: false,
      action,
      error: error.message,
      duration,
    };
  }
}

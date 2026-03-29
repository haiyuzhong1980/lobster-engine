// @lobster-engine/core — LobsterEngine

import type { EngineConfig, TurnEvent, ActionResult, ActionSpec } from './types.js';
import type { AIPlatformAdapter } from './adapter.js';
import type { ScenePlugin, SceneContext } from './scene.js';
import type { StorageProvider } from './storage.js';
import type { NatsClient } from './nats.js';
import { TypedEventEmitter, type EngineEventMap } from './events.js';
import { ScenePluginRegistry } from './scene-registry.js';
import { AdapterRegistry } from './adapter-registry.js';
import { ConfigManager } from './config.js';
import { StateManager } from './state.js';

// ---------------------------------------------------------------------------
// Supplementary types
// ---------------------------------------------------------------------------

export interface JoinSceneOptions {
  readonly config?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// LobsterEngine
// ---------------------------------------------------------------------------

/**
 * The main engine class.
 *
 * Lifecycle:
 *   1. Construct with an EngineConfig.
 *   2. Optionally chain `.use()`, `.registerAdapter()`, `.useStorage()`.
 *   3. Call `await engine.start()` — connects storage, connects adapters,
 *      initialises plugins, emits `engine:ready`.
 *   4. Call `await engine.handleTurnEvent(event)` for every incoming turn.
 *   5. Call `await engine.stop()` for a graceful shutdown.
 *
 * Events emitted during a turn (in order):
 *   `scene:turn`   — when a TurnEvent arrives
 *   `scene:action` — when an ActionResult is produced
 *   `engine:error` — when an unrecoverable error occurs inside processEvent
 */
/** Maximum time (ms) to wait for in-flight operations to finish on shutdown. */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 30_000;

/** Interval (ms) used to poll for in-flight operation drain. */
const SHUTDOWN_POLL_INTERVAL_MS = 100;

export class LobsterEngine extends TypedEventEmitter<EngineEventMap> {
  readonly config: Readonly<EngineConfig>;
  readonly scenes: ScenePluginRegistry;
  readonly adapters: AdapterRegistry;

  private stateManager: StateManager | undefined;
  private natsClient: NatsClient | undefined;
  private readonly configManager: ConfigManager;
  private _running = false;
  /** Count of turn events currently being processed. */
  private _inFlightCount = 0;
  /** Whether a shutdown has been initiated (blocks new turns). */
  private _shuttingDown = false;

  // Stored signal handler references so they can be removed on stop().
  private _sigTermHandler?: () => void;
  private _sigIntHandler?: () => void;
  private _sigUsr2Handler?: () => void;

  constructor(config: EngineConfig) {
    super();
    this.config = config;
    this.scenes = new ScenePluginRegistry();
    this.adapters = new AdapterRegistry();
    this.configManager = new ConfigManager();

    // Register plugins and adapters supplied at construction time.
    for (const plugin of config.plugins ?? []) {
      this.scenes.register(plugin);
    }
    for (const adapter of config.adapters ?? []) {
      this.adapters.register(adapter);
    }

    // Wire up storage if provided.
    if (config.storage !== undefined) {
      this.useStorage(config.storage);
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get running(): boolean {
    return this._running;
  }

  /** Number of turn events currently being processed. */
  get inFlightCount(): number {
    return this._inFlightCount;
  }

  /** True once a graceful shutdown has been initiated. */
  get shuttingDown(): boolean {
    return this._shuttingDown;
  }

  // ---------------------------------------------------------------------------
  // Fluent registration helpers (can be called before or after start())
  // ---------------------------------------------------------------------------

  /**
   * Register a scene plugin. Returns `this` for chaining.
   * Plugins registered after `start()` will be initialised immediately.
   */
  use(plugin: ScenePlugin): this {
    this.scenes.register(plugin);

    if (this._running && plugin.initialize !== undefined) {
      // Fire-and-forget initialisation for late registrations; errors bubble as
      // `engine:error` events so callers can react without blocking the chain.
      Promise.resolve(plugin.initialize(this)).catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit('engine:error', error);
      });
    }

    return this;
  }

  /**
   * Register an AI platform adapter. Returns `this` for chaining.
   */
  registerAdapter(adapter: AIPlatformAdapter): this {
    this.adapters.register(adapter);
    return this;
  }

  /**
   * Attach a StorageProvider and wire up a StateManager around it.
   * Returns `this` for chaining.
   *
   * If called multiple times the most recent storage wins (the previous
   * StateManager is replaced).
   */
  useStorage(storage: StorageProvider): this {
    this.stateManager = new StateManager({ hotStorage: storage });
    return this;
  }

  /**
   * Attach a NatsClient so the engine can broadcast shutdown signals and drain
   * the connection during graceful stop.
   * Returns `this` for chaining.
   */
  useNats(nats: NatsClient): this {
    this.natsClient = nats;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Start the engine:
   *   1. Connect storage (if configured).
   *   2. Connect all registered adapters.
   *   3. Initialise all registered plugins.
   *   4. Emit `engine:ready`.
   */
  async start(): Promise<void> {
    if (this._running) return;

    const logger = this.config.logger;

    // --- Storage ---
    if (this.stateManager !== undefined) {
      logger?.debug('LobsterEngine: connecting storage');
      await this.stateManager.connect();
    }

    // --- Adapters ---
    for (const adapter of this.adapters.list()) {
      const instance = this.adapters.get(adapter.name);
      if (instance === undefined) continue;
      logger?.debug('LobsterEngine: connecting adapter', { name: adapter.name });
      await instance.connect();
    }

    // --- Plugins ---
    for (const descriptor of this.scenes.list()) {
      const plugin = this.scenes.get(descriptor.name);
      if (plugin?.initialize !== undefined) {
        logger?.debug('LobsterEngine: initialising plugin', { name: descriptor.name });
        await plugin.initialize(this);
      }
    }

    this._running = true;
    logger?.info('LobsterEngine: ready', { name: this.config.name });
    this.emit('engine:ready');
  }

  /**
   * Gracefully stop the engine:
   *   1. Mark as shutting down (stop accepting new turn events).
   *   2. Emit `engine:stopping`.
   *   3. Send shutdown signal to all workers via NATS (`system.control`).
   *   4. Wait for in-flight operations to complete (max 30 s timeout).
   *   5. Flush state to storage.
   *   6. Drain the NATS connection (if attached).
   *   7. Disconnect storage providers.
   *   8. Disconnect AI adapters.
   *   9. Emit `engine:shutdown` and remove all event listeners.
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    const logger = this.config.logger;
    this._shuttingDown = true;

    // Remove OS signal handlers registered by registerSignalHandlers() so
    // repeated stop() calls or test teardown do not accumulate listeners.
    if (this._sigTermHandler !== undefined) {
      process.removeListener('SIGTERM', this._sigTermHandler);
      this._sigTermHandler = undefined;
    }
    if (this._sigIntHandler !== undefined) {
      process.removeListener('SIGINT', this._sigIntHandler);
      this._sigIntHandler = undefined;
    }
    if (this._sigUsr2Handler !== undefined) {
      process.removeListener('SIGUSR2', this._sigUsr2Handler);
      this._sigUsr2Handler = undefined;
    }

    logger?.info('LobsterEngine: stopping', { name: this.config.name });
    this.emit('engine:stopping');

    // --- Step 3: Send shutdown signal via NATS ---
    if (this.natsClient !== undefined) {
      try {
        this.natsClient.publish('system.control', { type: 'shutdown' });
        logger?.debug('LobsterEngine: published shutdown signal to system.control');
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger?.warn('LobsterEngine: failed to publish shutdown signal', {
          error: error.message,
        });
      }
    }

    // --- Step 4: Wait for in-flight operations (max 30 s) ---
    if (this._inFlightCount > 0) {
      logger?.info('LobsterEngine: waiting for in-flight operations', {
        count: this._inFlightCount,
      });
      await this.drainInflight();
    }

    // --- Step 5: Flush state ---
    if (this.stateManager !== undefined) {
      logger?.debug('LobsterEngine: flushing state to storage');
      // StateManager does not expose an explicit flush — disconnect handles it.
    }

    // --- Step 6: Drain NATS ---
    if (this.natsClient !== undefined) {
      logger?.debug('LobsterEngine: draining NATS connection');
      try {
        await this.natsClient.drain();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger?.error('LobsterEngine: error draining NATS', { error: error.message });
      }
    }

    // --- Step 7: Disconnect storage ---
    if (this.stateManager !== undefined) {
      logger?.debug('LobsterEngine: disconnecting storage');
      try {
        await this.stateManager.disconnect();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger?.error('LobsterEngine: error disconnecting storage', {
          error: error.message,
        });
      }
    }

    // --- Step 8: Disconnect adapters ---
    for (const descriptor of this.adapters.list()) {
      const instance = this.adapters.get(descriptor.name);
      if (instance === undefined) continue;
      logger?.debug('LobsterEngine: disconnecting adapter', { name: descriptor.name });
      try {
        await instance.disconnect();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger?.error('LobsterEngine: error disconnecting adapter', {
          name: descriptor.name,
          error: error.message,
        });
      }
    }

    this._running = false;
    this._shuttingDown = false;

    // --- Step 9: Final events ---
    this.emit('engine:shutdown');
    this.removeAllListeners();
  }

  /**
   * Register OS signal handlers for graceful shutdown and health dump.
   *
   * - SIGTERM / SIGINT → calls `stop()` then exits with code 0.
   * - SIGUSR2         → dumps current health status to stdout (non-fatal).
   *
   * Call this once, typically at the process entrypoint.
   */
  registerSignalHandlers(): void {
    this._sigTermHandler = (): void => {
      void this.stop().then(() => {
        process.exit(0);
      });
    };
    this._sigIntHandler = (): void => {
      void this.stop().then(() => {
        process.exit(0);
      });
    };
    this._sigUsr2Handler = (): void => {
      const mem = process.memoryUsage();
      const status = {
        name: this.config.name,
        running: this._running,
        shuttingDown: this._shuttingDown,
        inFlight: this._inFlightCount,
        uptimeMs: process.uptime() * 1000,
        memory: {
          heapUsedMb: (mem.heapUsed / 1_048_576).toFixed(1),
          heapTotalMb: (mem.heapTotal / 1_048_576).toFixed(1),
        },
      };
      process.stdout.write(JSON.stringify(status) + '\n');
    };

    process.once('SIGTERM', this._sigTermHandler);
    process.once('SIGINT', this._sigIntHandler);
    process.on('SIGUSR2', this._sigUsr2Handler);
  }

  // ---------------------------------------------------------------------------
  // Private shutdown helpers
  // ---------------------------------------------------------------------------

  /**
   * Poll until all in-flight turn events finish or the drain timeout expires.
   */
  private drainInflight(): Promise<void> {
    return new Promise<void>((resolve) => {
      const deadline = Date.now() + SHUTDOWN_DRAIN_TIMEOUT_MS;

      const poll = (): void => {
        if (this._inFlightCount === 0 || Date.now() >= deadline) {
          if (this._inFlightCount > 0) {
            this.config.logger?.warn('LobsterEngine: shutdown timeout — dropping in-flight ops', {
              count: this._inFlightCount,
            });
          }
          resolve();
          return;
        }
        setTimeout(poll, SHUTDOWN_POLL_INTERVAL_MS);
      };

      poll();
    });
  }

  // ---------------------------------------------------------------------------
  // Core turn handling
  // ---------------------------------------------------------------------------

  /**
   * Process an incoming turn event end-to-end.
   *
   * Steps:
   *   1. Resolve the scene plugin for `event.sceneId`.
   *   2. Select an AI adapter.
   *   3. Emit `scene:turn`.
   *   4. Delegate to `processEvent`.
   *   5. Emit `scene:action` with the result.
   *   6. Return the ActionResult.
   *
   * Errors thrown inside `processEvent` are caught, wrapped into a failed
   * ActionResult, and re-emitted as `engine:error` so callers can observe
   * them without crashing the runtime.
   */
  async handleTurnEvent(event: TurnEvent): Promise<ActionResult> {
    this._inFlightCount++;
    try {
      return await this._handleTurnEventInner(event);
    } finally {
      this._inFlightCount--;
    }
  }

  private async _handleTurnEventInner(event: TurnEvent): Promise<ActionResult> {
    const logger = this.config.logger;

    // 1. Resolve plugin by sceneType.  We use sceneId as the lookup key for
    //    the scene type.  Plugins are matched by their declared sceneType; we
    //    check all registered plugins for one whose sceneType matches the
    //    event's sceneId prefix or exact value.  The simplest contract: the
    //    caller must ensure the event's sceneId contains the sceneType.
    //
    //    Strategy: try exact sceneType match first, then prefix match.
    const plugin = this.resolvePlugin(event);

    if (plugin === undefined) {
      const err = new Error(
        `No ScenePlugin found for sceneId "${event.sceneId}" ` +
          `(event type: "${event.type}"). ` +
          `Registered scene types: [${this.scenes
            .list()
            .map((p) => p.sceneType)
            .join(', ')}].`,
      );
      logger?.error('LobsterEngine: plugin not found', { sceneId: event.sceneId });
      this.emit('engine:error', err);

      const failedResult: ActionResult = {
        success: false,
        action: this.emptyAction(),
        error: err.message,
        duration: 0,
      };
      return failedResult;
    }

    // 2. Select an adapter.
    let adapter: AIPlatformAdapter;
    try {
      adapter = await this.adapters.selectAdapter();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger?.error('LobsterEngine: no adapter available', { error: error.message });
      this.emit('engine:error', error);

      const failedResult: ActionResult = {
        success: false,
        action: plugin.getDefaultAction(event, this.buildContext(event)),
        error: error.message,
        duration: 0,
      };
      return failedResult;
    }

    // 3. Emit scene:turn.
    this.emit('scene:turn', event.botId, event.sceneId, event);

    // 4. Process and capture any errors as a failed result.
    let result: ActionResult;
    try {
      result = await this.processEvent(event, plugin, adapter);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger?.error('LobsterEngine: processEvent threw', { error: error.message });
      this.emit('engine:error', error);

      result = {
        success: false,
        action: plugin.getDefaultAction(event, this.buildContext(event)),
        error: error.message,
        duration: 0,
      };
    }

    // 5. Emit scene:action.
    this.emit('scene:action', event.botId, event.sceneId, result);

    return result;
  }

  // ---------------------------------------------------------------------------
  // Core processing loop (private)
  // ---------------------------------------------------------------------------

  /**
   * Execute the full bot-turn pipeline for one event:
   *
   *   buildPrompt → adapter.chat → parseAction → validateAction → result
   *
   * If the parsed action fails validation, `getDefaultAction` is used and the
   * result is marked `success: false` with the validation reason attached.
   */
  private async processEvent(
    event: TurnEvent,
    plugin: ScenePlugin,
    adapter: AIPlatformAdapter,
  ): Promise<ActionResult> {
    const logger = this.config.logger;
    const context = this.buildContext(event);
    const start = Date.now();

    // --- Build prompt ---
    const messages = plugin.buildPrompt(event, context);
    logger?.debug('LobsterEngine: prompt built', {
      botId: event.botId,
      sceneId: event.sceneId,
      messageCount: messages.length,
    });

    // --- Call adapter ---
    const response = await adapter.chat(messages);
    logger?.debug('LobsterEngine: adapter responded', {
      botId: event.botId,
      finishReason: response.finishReason,
      tokens: response.usage?.totalTokens,
    });

    // --- Parse action ---
    let action: ActionSpec;
    let parseError: string | undefined;

    try {
      action = plugin.parseAction(response.content, context);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger?.warn('LobsterEngine: parseAction threw, using default', {
        botId: event.botId,
        error: error.message,
      });
      action = plugin.getDefaultAction(event, context);
      parseError = `parseAction error: ${error.message}`;
    }

    // --- Validate action ---
    const validation = plugin.validateAction(action, context);
    const duration = Date.now() - start;

    if (!validation.valid) {
      logger?.warn('LobsterEngine: action invalid, using default', {
        botId: event.botId,
        reason: validation.reason,
      });

      const defaultAction = plugin.getDefaultAction(event, context);

      return {
        success: false,
        action: defaultAction,
        error: parseError ?? validation.reason ?? 'Action failed validation',
        duration,
      };
    }

    return {
      success: true,
      action,
      error: parseError,
      duration,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the best-matching ScenePlugin for a TurnEvent.
   *
   * Match priority:
   *   1. Plugin whose `sceneType` exactly equals `event.sceneId`.
   *   2. Plugin whose `sceneType` is a prefix of `event.sceneId` (e.g.
   *      sceneType "werewolf" matches sceneId "werewolf:room-42").
   *   3. Undefined — no match found.
   */
  private resolvePlugin(event: TurnEvent): ScenePlugin | undefined {
    // Exact match.
    const exact = this.scenes.getByType(event.sceneId);
    if (exact !== undefined) return exact;

    // Prefix match — longest prefix wins.
    let best: ScenePlugin | undefined;
    for (const descriptor of this.scenes.list()) {
      const plugin = this.scenes.get(descriptor.name);
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

  /**
   * Build a minimal SceneContext from a TurnEvent.
   *
   * Full context enrichment (persistent state, history) belongs in a future
   * phase when the StateManager integration is complete.  For now the context
   * carries the identifiers and an empty state/history so that plugins can
   * operate without crashing.
   */
  private buildContext(event: TurnEvent): SceneContext {
    return {
      botId: event.botId,
      sceneId: event.sceneId,
      state: {},
      history: [],
    };
  }

  /**
   * A typed no-op action used as a last-resort fallback before a plugin is
   * resolved (so we have *something* to return in the ActionResult).
   */
  private emptyAction(): ActionSpec {
    return {
      type: 'noop',
      content: '',
      target: undefined,
      metadata: {},
    };
  }

  // ---------------------------------------------------------------------------
  // Expose configManager for downstream consumers (read-only)
  // ---------------------------------------------------------------------------

  get config_manager(): ConfigManager {
    return this.configManager;
  }
}

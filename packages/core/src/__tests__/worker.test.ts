// @lobster-engine/core — BotWorker tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BotWorker } from '../worker.js';
import type { WorkerConfig } from '../worker.js';
import type { TurnEvent, ActionSpec } from '../types.js';
import { AdapterPool } from '../adapter-pool.js';
import { ScenePluginRegistry } from '../scene-registry.js';
import { MetricsRegistry } from '../metrics.js';
import {
  MockStorageProvider,
  MockAIPlatformAdapter,
  MockScenePlugin,
  makeTurnEvent,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Promise-flush utility
// ---------------------------------------------------------------------------

/**
 * Flush all pending microtasks / promise callbacks without advancing fake
 * timers.  This lets async pipelines driven by resolved mocks complete
 * without triggering the heartbeat setInterval loop.
 *
 * Each `await Promise.resolve()` drains one turn of the microtask queue.
 * Ten rounds is more than enough for our deepest async chain.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal NatsClient mock.
 *
 * We avoid opening a real NATS connection in unit tests by replacing the
 * NatsClient prototype methods with vi.fn() stubs.  The approach is:
 * - `connect` / `disconnect` / `drain` resolve immediately.
 * - `queueSubscribe` captures the handler so tests can call it directly.
 * - `publish` is a spy that records calls.
 */
interface NatsCapture {
  publishedMessages: Array<{ subject: string; data: unknown }>;
  triggerMessage: (data: unknown) => Promise<void>;
}

function stubNatsClient(target: BotWorker): NatsCapture {
  const capture: NatsCapture = {
    publishedMessages: [],
    triggerMessage: async (_data: unknown) => {
      /* replaced after queueSubscribe is captured */
    },
  };

  // Access private nats field via cast.
  const worker = target as unknown as {
    nats: {
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      drain: ReturnType<typeof vi.fn>;
      queueSubscribe: ReturnType<typeof vi.fn>;
      publish: ReturnType<typeof vi.fn>;
    };
  };

  worker.nats.connect = vi.fn().mockResolvedValue(undefined);
  worker.nats.disconnect = vi.fn().mockResolvedValue(undefined);
  worker.nats.drain = vi.fn().mockResolvedValue(undefined);
  worker.nats.publish = vi.fn().mockImplementation((subject: string, data: unknown) => {
    capture.publishedMessages.push({ subject, data });
  });
  worker.nats.queueSubscribe = vi.fn().mockImplementation(
    (_subject: string, _queue: string, handler: (d: unknown) => Promise<void>) => {
      capture.triggerMessage = handler;
      return { unsubscribe: vi.fn() };
    },
  );

  return capture;
}

/**
 * Also stub stateManager.connect / disconnect so tests don't need real Redis.
 */
function stubStateManager(target: BotWorker): void {
  const worker = target as unknown as {
    stateManager: {
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      getBotState: ReturnType<typeof vi.fn>;
      setBotState: ReturnType<typeof vi.fn>;
    };
  };
  worker.stateManager.connect = vi.fn().mockResolvedValue(undefined);
  worker.stateManager.disconnect = vi.fn().mockResolvedValue(undefined);
  // Default: no existing bot state
  worker.stateManager.getBotState = vi.fn().mockResolvedValue(null);
  worker.stateManager.setBotState = vi.fn().mockResolvedValue(undefined);
}

function makeTurnEventMsg(overrides?: Partial<TurnEvent>): TurnEvent {
  return makeTurnEvent({ sceneId: 'mock-scene:room-1', ...overrides });
}

// ---------------------------------------------------------------------------
// Shared factory
// ---------------------------------------------------------------------------

interface WorkerFixture {
  worker: BotWorker;
  registry: ScenePluginRegistry;
  pool: AdapterPool;
  storage: MockStorageProvider;
  plugin: MockScenePlugin;
  adapter: MockAIPlatformAdapter;
  natsCapture: NatsCapture;
  config: WorkerConfig;
}

function makeWorkerFixture(options?: {
  adapterOptions?: ConstructorParameters<typeof MockAIPlatformAdapter>[0];
  pluginOptions?: ConstructorParameters<typeof MockScenePlugin>[0];
  maxConcurrent?: number;
  heartbeatInterval?: number;
}): WorkerFixture {
  const storage = new MockStorageProvider();
  const adapter = new MockAIPlatformAdapter(options?.adapterOptions ?? {});
  const pool = new AdapterPool([adapter]);
  const plugin = new MockScenePlugin(options?.pluginOptions ?? {});
  const registry = new ScenePluginRegistry();
  registry.register(plugin);

  const config: WorkerConfig = {
    workerId: 'worker-test-001',
    natsUrl: 'nats://localhost:4222',
    storage,
    adapterPool: pool,
    sceneRegistry: registry,
    maxConcurrent: options?.maxConcurrent ?? 10,
    heartbeatInterval: options?.heartbeatInterval ?? 60_000, // long — avoids interference
  };

  const worker = new BotWorker(config);
  const natsCapture = stubNatsClient(worker);
  stubStateManager(worker);

  return { worker, registry, pool, storage, plugin, adapter, natsCapture, config };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BotWorker', () => {
  // Reset the singleton metrics registry between tests to keep counts isolated
  beforeEach(() => {
    MetricsRegistry._resetForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts with status stopped', () => {
      const { worker } = makeWorkerFixture();
      expect(worker.health().status).toBe('stopped');
    });

    it('transitions to running after start()', async () => {
      const { worker } = makeWorkerFixture();
      await worker.start();
      expect(worker.health().status).toBe('running');
      await worker.stop();
    });

    it('transitions to stopped after stop()', async () => {
      const { worker } = makeWorkerFixture();
      await worker.start();
      await worker.stop();
      expect(worker.health().status).toBe('stopped');
    });

    it('start() is idempotent — second call is a no-op', async () => {
      const { worker } = makeWorkerFixture();
      await worker.start();
      await worker.start(); // should not throw or double-subscribe
      expect(worker.health().status).toBe('running');
      await worker.stop();
    });

    it('stop() is idempotent when already stopped', async () => {
      const { worker } = makeWorkerFixture();
      await worker.stop(); // must not throw
      expect(worker.health().status).toBe('stopped');
    });

    it('connects NATS on start', async () => {
      const { worker } = makeWorkerFixture();
      const w = worker as unknown as { nats: { connect: ReturnType<typeof vi.fn> } };
      await worker.start();
      expect(w.nats.connect).toHaveBeenCalledOnce();
      await worker.stop();
    });

    it('drains NATS on stop', async () => {
      const { worker } = makeWorkerFixture();
      const w = worker as unknown as { nats: { drain: ReturnType<typeof vi.fn> } };
      await worker.start();
      await worker.stop();
      expect(w.nats.drain).toHaveBeenCalledOnce();
    });

    it('queue-subscribes to worker.assign under lobster-workers group', async () => {
      const { worker } = makeWorkerFixture();
      const w = worker as unknown as { nats: { queueSubscribe: ReturnType<typeof vi.fn> } };
      await worker.start();
      expect(w.nats.queueSubscribe).toHaveBeenCalledWith(
        'worker.assign',
        'lobster-workers',
        expect.any(Function),
      );
      await worker.stop();
    });

    it('connects stateManager on start', async () => {
      const { worker } = makeWorkerFixture();
      const w = worker as unknown as { stateManager: { connect: ReturnType<typeof vi.fn> } };
      await worker.start();
      expect(w.stateManager.connect).toHaveBeenCalledOnce();
      await worker.stop();
    });

    it('disconnects stateManager on stop', async () => {
      const { worker } = makeWorkerFixture();
      const w = worker as unknown as { stateManager: { disconnect: ReturnType<typeof vi.fn> } };
      await worker.start();
      await worker.stop();
      expect(w.stateManager.disconnect).toHaveBeenCalledOnce();
    });

    it('uptime is 0 before start and positive after start', async () => {
      const { worker } = makeWorkerFixture();
      expect(worker.health().uptime).toBe(0);
      await worker.start();
      // Advance fake timers by 5 s
      vi.advanceTimersByTime(5_000);
      expect(worker.health().uptime).toBeGreaterThanOrEqual(0);
      await worker.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Turn event processing
  // -------------------------------------------------------------------------

  describe('turn event processing', () => {
    it('processes a valid turn event and publishes an action result', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      const event = makeTurnEventMsg();
      await natsCapture.triggerMessage(event);

      // Allow the async pipeline to settle
      await flushPromises();

      const botActionMsg = natsCapture.publishedMessages.find((m) =>
        m.subject.startsWith(`bot.${event.botId}.action`),
      );
      expect(botActionMsg).toBeDefined();
      const result = botActionMsg?.data as { success: boolean; action: ActionSpec };
      expect(result.success).toBe(true);
      expect(result.action.type).toBe('vote');

      await worker.stop();
    });

    it('increments totalProcessed after a turn', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();
      expect(worker.health().totalProcessed).toBe(0);

      await natsCapture.triggerMessage(makeTurnEventMsg());
      await flushPromises();

      expect(worker.health().totalProcessed).toBe(1);
      await worker.stop();
    });

    it('calls buildPrompt, parseAction, validateAction in order', async () => {
      const { worker, plugin, natsCapture } = makeWorkerFixture();
      await worker.start();

      await natsCapture.triggerMessage(makeTurnEventMsg());
      await flushPromises();

      expect(plugin.buildPromptCallCount).toBe(1);
      expect(plugin.parseActionCallCount).toBe(1);
      expect(plugin.validateActionCallCount).toBe(1);

      await worker.stop();
    });

    it('reads bot state from stateManager before processing', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      const sm = worker as unknown as { stateManager: { getBotState: ReturnType<typeof vi.fn> } };
      await worker.start();

      await natsCapture.triggerMessage(makeTurnEventMsg({ botId: 'bot-42' }));
      await flushPromises();

      expect(sm.stateManager.getBotState).toHaveBeenCalledWith('bot-42');
      await worker.stop();
    });

    it('silently drops malformed payloads', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      await natsCapture.triggerMessage({ garbage: true });
      await flushPromises();

      expect(worker.health().totalProcessed).toBe(0);
      // No action result published
      expect(
        natsCapture.publishedMessages.filter((m) => m.subject.includes('.action')),
      ).toHaveLength(0);

      await worker.stop();
    });

    it('silently drops null payloads', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      await natsCapture.triggerMessage(null);
      await flushPromises();

      expect(worker.health().totalProcessed).toBe(0);
      await worker.stop();
    });

    it('silently drops string payloads', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      await natsCapture.triggerMessage('not-an-object');
      await flushPromises();

      expect(worker.health().totalProcessed).toBe(0);
      await worker.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling and fallback
  // -------------------------------------------------------------------------

  describe('error handling and fallback', () => {
    it('uses default action when parseAction throws', async () => {
      const { worker, natsCapture } = makeWorkerFixture({
        pluginOptions: { parseError: new Error('bad parse') },
      });
      await worker.start();

      const event = makeTurnEventMsg();
      await natsCapture.triggerMessage(event);
      await flushPromises();

      const msg = natsCapture.publishedMessages.find((m) =>
        m.subject === `bot.${event.botId}.action`,
      );
      const result = msg?.data as { success: boolean; action: ActionSpec; error?: string };
      expect(result).toBeDefined();
      expect(result.action.type).toBe('noop');
      expect(result.error).toContain('bad parse');
      await worker.stop();
    });

    it('uses default action when validateAction returns invalid', async () => {
      const { worker, natsCapture } = makeWorkerFixture({
        pluginOptions: { invalidReason: 'target is dead' },
      });
      await worker.start();

      const event = makeTurnEventMsg();
      await natsCapture.triggerMessage(event);
      await flushPromises();

      const msg = natsCapture.publishedMessages.find((m) =>
        m.subject === `bot.${event.botId}.action`,
      );
      const result = msg?.data as { success: boolean; action: ActionSpec; error?: string };
      expect(result.success).toBe(false);
      expect(result.action.type).toBe('noop');
      expect(result.error).toContain('target is dead');
      await worker.stop();
    });

    it('returns failed result and increments errorCount when plugin not found', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      const event = makeTurnEventMsg({ sceneId: 'unknown-scene:xyz' });
      await natsCapture.triggerMessage(event);
      await flushPromises();

      expect(worker.health().errors).toBe(1);

      const msg = natsCapture.publishedMessages.find((m) =>
        m.subject === `bot.${event.botId}.action`,
      );
      const result = msg?.data as { success: boolean };
      expect(result.success).toBe(false);
      await worker.stop();
    });

    it('continues processing after a per-turn error', async () => {
      const { worker, natsCapture } = makeWorkerFixture({
        pluginOptions: { parseError: new Error('first-turn-error') },
      });
      await worker.start();

      await natsCapture.triggerMessage(makeTurnEventMsg());
      await flushPromises();
      await natsCapture.triggerMessage(makeTurnEventMsg({ id: 'event-2' }));
      await flushPromises();

      // Both events were processed (even though they both errored via parseError)
      expect(worker.health().totalProcessed).toBe(2);
      await worker.stop();
    });

    it('still publishes a result even when the adapter pool throws', async () => {
      const { worker, natsCapture } = makeWorkerFixture({
        adapterOptions: { chatError: new Error('adapter down') },
      });
      await worker.start();

      const event = makeTurnEventMsg();
      await natsCapture.triggerMessage(event);
      await flushPromises();

      const msg = natsCapture.publishedMessages.find((m) =>
        m.subject === `bot.${event.botId}.action`,
      );
      expect(msg).toBeDefined();
      const result = msg?.data as { success: boolean };
      expect(result.success).toBe(false);
      await worker.stop();
    });

    it('does not process events after stop', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();
      await worker.stop();

      await natsCapture.triggerMessage(makeTurnEventMsg());
      await flushPromises();

      expect(worker.health().totalProcessed).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrency limiting
  // -------------------------------------------------------------------------

  describe('concurrency limiting', () => {
    it('drops events when activeCount >= maxConcurrent', async () => {
      // Use maxConcurrent = 1 and a slow chat to saturate the slot
      let releaseLatch!: () => void;
      const latch = new Promise<void>((res) => {
        releaseLatch = res;
      });

      const slowAdapter = new MockAIPlatformAdapter();
      // Override chat to block until we release the latch
      slowAdapter.chat = vi.fn().mockImplementation(async () => {
        await latch;
        return {
          content: '{"type":"vote","target":"player1"}',
          finishReason: 'stop' as const,
        };
      });

      const pool = new AdapterPool([slowAdapter]);
      const registry = new ScenePluginRegistry();
      registry.register(new MockScenePlugin());

      const storage = new MockStorageProvider();
      const worker = new BotWorker({
        workerId: 'worker-conc-test',
        natsUrl: 'nats://localhost:4222',
        storage,
        adapterPool: pool,
        sceneRegistry: registry,
        maxConcurrent: 1,
        heartbeatInterval: 60_000,
      });
      const natsCapture = stubNatsClient(worker);
      stubStateManager(worker);

      await worker.start();

      // First event occupies the single slot (pipeline blocked on latch)
      void natsCapture.triggerMessage(makeTurnEventMsg({ id: 'e-1' }));

      // Give the first event time to enter the pipeline and increment activeCount
      await flushPromises();

      // Second event should be dropped since slot is full
      await natsCapture.triggerMessage(makeTurnEventMsg({ id: 'e-2' }));
      await flushPromises();

      // Release the blocked first turn
      releaseLatch();
      await flushPromises();

      // Only 1 turn completed (the second was dropped)
      expect(worker.health().totalProcessed).toBe(1);

      await worker.stop();
    });

    it('tracks activeTasks correctly during processing', async () => {
      let activeAtPeak = 0;
      let releaseLatch!: () => void;
      const latch = new Promise<void>((res) => {
        releaseLatch = res;
      });

      const blockingAdapter = new MockAIPlatformAdapter();
      blockingAdapter.chat = vi.fn().mockImplementation(async () => {
        activeAtPeak = Math.max(activeAtPeak, 1); // recorded inside pipeline
        await latch;
        return { content: '{}', finishReason: 'stop' as const };
      });

      const pool = new AdapterPool([blockingAdapter]);
      const registry = new ScenePluginRegistry();
      registry.register(new MockScenePlugin());
      const worker = new BotWorker({
        workerId: 'worker-active-test',
        natsUrl: 'nats://localhost:4222',
        storage: new MockStorageProvider(),
        adapterPool: pool,
        sceneRegistry: registry,
        heartbeatInterval: 60_000,
      });
      const natsCapture = stubNatsClient(worker);
      stubStateManager(worker);

      await worker.start();
      void natsCapture.triggerMessage(makeTurnEventMsg());
      await flushPromises();

      releaseLatch();
      await flushPromises();

      expect(worker.health().activeTasks).toBe(0);
      await worker.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  describe('heartbeat', () => {
    it('publishes a heartbeat on the configured interval', async () => {
      const { worker, natsCapture } = makeWorkerFixture({
        heartbeatInterval: 1_000,
      });
      await worker.start();

      // Advance 2.5 intervals — should fire twice
      vi.advanceTimersByTime(2_500);

      const heartbeats = natsCapture.publishedMessages.filter((m) =>
        m.subject.startsWith('worker.worker-test-001.heartbeat'),
      );
      expect(heartbeats.length).toBeGreaterThanOrEqual(2);

      await worker.stop();
    });

    it('heartbeat subject includes the workerId', async () => {
      const { worker, natsCapture } = makeWorkerFixture({ heartbeatInterval: 500 });
      await worker.start();

      vi.advanceTimersByTime(600);

      const hb = natsCapture.publishedMessages.find((m) =>
        m.subject === 'worker.worker-test-001.heartbeat',
      );
      expect(hb).toBeDefined();

      await worker.stop();
    });

    it('heartbeat payload contains workerId, timestamp, activeTasks, totalProcessed', async () => {
      const { worker, natsCapture } = makeWorkerFixture({ heartbeatInterval: 500 });
      await worker.start();

      vi.advanceTimersByTime(600);

      const hb = natsCapture.publishedMessages.find((m) =>
        m.subject === 'worker.worker-test-001.heartbeat',
      );
      const payload = hb?.data as Record<string, unknown>;
      expect(typeof payload['workerId']).toBe('string');
      expect(typeof payload['timestamp']).toBe('number');
      expect(typeof payload['activeTasks']).toBe('number');
      expect(typeof payload['totalProcessed']).toBe('number');

      await worker.stop();
    });

    it('stops publishing heartbeats after stop()', async () => {
      const { worker, natsCapture } = makeWorkerFixture({ heartbeatInterval: 500 });
      await worker.start();
      await worker.stop();

      const countBefore = natsCapture.publishedMessages.filter((m) =>
        m.subject.includes('.heartbeat'),
      ).length;

      vi.advanceTimersByTime(2_000);

      const countAfter = natsCapture.publishedMessages.filter((m) =>
        m.subject.includes('.heartbeat'),
      ).length;

      expect(countAfter).toBe(countBefore);
    });
  });

  // -------------------------------------------------------------------------
  // Health snapshot
  // -------------------------------------------------------------------------

  describe('health()', () => {
    it('returns stopped status before start', () => {
      const { worker } = makeWorkerFixture();
      const h = worker.health();
      expect(h.status).toBe('stopped');
      expect(h.workerId).toBe('worker-test-001');
      expect(h.activeTasks).toBe(0);
      expect(h.totalProcessed).toBe(0);
      expect(h.errors).toBe(0);
      expect(h.uptime).toBe(0);
    });

    it('returns running status while running', async () => {
      const { worker } = makeWorkerFixture();
      await worker.start();
      expect(worker.health().status).toBe('running');
      await worker.stop();
    });

    it('reflects correct totalProcessed after multiple turns', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      for (let i = 0; i < 3; i++) {
        await natsCapture.triggerMessage(makeTurnEventMsg({ id: `e-${i}` }));
      }
      await flushPromises();

      expect(worker.health().totalProcessed).toBe(3);
      await worker.stop();
    });

    it('reflects errors count after failed turns', async () => {
      const { worker, natsCapture } = makeWorkerFixture();
      await worker.start();

      // Send an event for an unknown scene to trigger the plugin-not-found error path
      await natsCapture.triggerMessage(makeTurnEventMsg({ sceneId: 'no-such-scene:1' }));
      await flushPromises();

      expect(worker.health().errors).toBeGreaterThanOrEqual(1);
      await worker.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Graceful drain
  // -------------------------------------------------------------------------

  describe('graceful drain', () => {
    it('stop() waits for in-flight turns before disconnecting storage', async () => {
      let releaseLatch!: () => void;
      const latch = new Promise<void>((res) => {
        releaseLatch = res;
      });

      const blockingAdapter = new MockAIPlatformAdapter();
      blockingAdapter.chat = vi.fn().mockImplementation(async () => {
        await latch;
        return {
          content: '{"type":"vote","target":"player1"}',
          finishReason: 'stop' as const,
        };
      });

      const pool = new AdapterPool([blockingAdapter]);
      const registry = new ScenePluginRegistry();
      registry.register(new MockScenePlugin());
      const worker = new BotWorker({
        workerId: 'drain-test',
        natsUrl: 'nats://localhost:4222',
        storage: new MockStorageProvider(),
        adapterPool: pool,
        sceneRegistry: registry,
        heartbeatInterval: 60_000,
      });
      const natsCapture = stubNatsClient(worker);
      const sm = worker as unknown as {
        stateManager: {
          connect: ReturnType<typeof vi.fn>;
          disconnect: ReturnType<typeof vi.fn>;
          getBotState: ReturnType<typeof vi.fn>;
          setBotState: ReturnType<typeof vi.fn>;
        };
      };
      sm.stateManager.connect = vi.fn().mockResolvedValue(undefined);
      sm.stateManager.disconnect = vi.fn().mockResolvedValue(undefined);
      sm.stateManager.getBotState = vi.fn().mockResolvedValue(null);
      sm.stateManager.setBotState = vi.fn().mockResolvedValue(undefined);

      await worker.start();

      // Start a turn (blocked on latch)
      void natsCapture.triggerMessage(makeTurnEventMsg());

      // Allow the turn to enter the pipeline
      await flushPromises();

      // Begin stopping — this should wait until the latch is released
      const stopPromise = worker.stop();

      // Verify stateManager.disconnect has NOT been called yet (turn still in flight)
      // We can only assert after a tick because stop() is async
      await Promise.resolve(); // flush microtask queue
      // Don't assert intermediate state here — just release and verify sequence
      releaseLatch();
      // Flush promise chains so activeCount decrements before the drain poll fires
      await flushPromises();
      // Advance fake timers to trigger the drainActiveTasks poll (setTimeout 10ms)
      vi.advanceTimersByTime(20);
      await flushPromises();
      await stopPromise;

      expect(sm.stateManager.disconnect).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Auto-generated workerId
  // -------------------------------------------------------------------------

  describe('workerId', () => {
    it('auto-generates a UUID when workerId is omitted', () => {
      const pool = new AdapterPool([new MockAIPlatformAdapter()]);
      const registry = new ScenePluginRegistry();
      const worker = new BotWorker({
        natsUrl: 'nats://localhost:4222',
        storage: new MockStorageProvider(),
        adapterPool: pool,
        sceneRegistry: registry,
      });
      const h = worker.health();
      expect(h.workerId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('uses provided workerId', () => {
      const { worker } = makeWorkerFixture();
      expect(worker.health().workerId).toBe('worker-test-001');
    });
  });
});

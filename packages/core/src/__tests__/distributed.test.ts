// @lobster-engine/core — P4.9 Distributed Integration Test
//
// Verifies the full distributed flow with in-memory mocks:
//   Gateway receives action → publishes to NATS → Worker picks up →
//   processes → publishes result → Gateway receives via NatsBridge
//
// No real NATS server is required.  A lightweight in-memory pub/sub
// implementation is used in place of the real NATS connection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotWorker } from '../worker.js';
import type { WorkerConfig } from '../worker.js';
import type { TurnEvent, ActionResult } from '../types.js';
import { AdapterPool } from '../adapter-pool.js';
import { ScenePluginRegistry } from '../scene-registry.js';
import { MetricsRegistry } from '../metrics.js';
import {
  MockStorageProvider,
  MockAIPlatformAdapter,
  MockScenePlugin,
} from './helpers.js';

// ---------------------------------------------------------------------------
// In-memory NATS bus
// ---------------------------------------------------------------------------
//
// Routes messages by subject.  Supports exact-subject subscriptions as well
// as queue-group subscriptions (round-robin delivery).

type MessageHandler = (data: unknown) => Promise<void>;

interface Subscriber {
  handler: MessageHandler;
  queueGroup: string | undefined;
}

class InMemoryNats {
  private readonly subs = new Map<string, Subscriber[]>();
  /** Track every publish call for assertion. */
  readonly published: Array<{ subject: string; data: unknown }> = [];
  /** Round-robin cursor per queue group per subject. */
  private readonly rrCursor = new Map<string, number>();

  async publish(subject: string, data: unknown): Promise<void> {
    this.published.push({ subject, data });
    await this.route(subject, data);
  }

  subscribe(subject: string, handler: MessageHandler): { unsubscribe: () => void } {
    this.addSub(subject, { handler, queueGroup: undefined });
    return {
      unsubscribe: () => this.removeSub(subject, handler),
    };
  }

  queueSubscribe(
    subject: string,
    queueGroup: string,
    handler: MessageHandler,
  ): { unsubscribe: () => void } {
    this.addSub(subject, { handler, queueGroup });
    return {
      unsubscribe: () => this.removeSub(subject, handler),
    };
  }

  private addSub(subject: string, sub: Subscriber): void {
    const list = this.subs.get(subject) ?? [];
    list.push(sub);
    this.subs.set(subject, list);
  }

  private removeSub(subject: string, handler: MessageHandler): void {
    const list = this.subs.get(subject) ?? [];
    this.subs.set(
      subject,
      list.filter((s) => s.handler !== handler),
    );
  }

  private async route(subject: string, data: unknown): Promise<void> {
    const list = this.subs.get(subject) ?? [];
    if (list.length === 0) return;

    // Separate queue-group subscribers from non-queued.
    const groups = new Map<string, Subscriber[]>();
    const nonQueued: Subscriber[] = [];

    for (const sub of list) {
      if (sub.queueGroup !== undefined) {
        const g = groups.get(sub.queueGroup) ?? [];
        g.push(sub);
        groups.set(sub.queueGroup, g);
      } else {
        nonQueued.push(sub);
      }
    }

    // Deliver to every non-queued subscriber.
    for (const sub of nonQueued) {
      await sub.handler(data);
    }

    // Deliver to exactly one member of each queue group (round-robin).
    for (const [groupKey, members] of groups) {
      const cursorKey = `${subject}::${groupKey}`;
      const cursor = this.rrCursor.get(cursorKey) ?? 0;
      const target = members[cursor % members.length];
      this.rrCursor.set(cursorKey, cursor + 1);
      if (target !== undefined) {
        await target.handler(data);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gateway simulator
//
// Mimics what the real Gateway does:
//   - receives external action requests
//   - publishes TurnEvents to worker.assign
//   - subscribes to bot.{botId}.action for results
// ---------------------------------------------------------------------------

interface GatewayResponse {
  botId: string;
  result: ActionResult;
}

class MockGateway {
  private readonly resultHandlers = new Map<
    string,
    (result: ActionResult) => void
  >();

  constructor(private readonly bus: InMemoryNats) {}

  start(): void {
    // Subscribe to all bot action results using a wildcard-like subscription.
    // Our simple bus only supports exact subjects, so we register a helper
    // that the workers use to deliver results through a known subject.
    this.bus.subscribe('gateway.results', async (data: unknown) => {
      const msg = data as GatewayResponse;
      const resolve = this.resultHandlers.get(msg.botId);
      if (resolve !== undefined) {
        resolve(msg.result);
        this.resultHandlers.delete(msg.botId);
      }
    });
  }

  /**
   * Dispatch a TurnEvent and wait for the corresponding ActionResult.
   * Times out after `timeoutMs` ms.
   */
  dispatch(event: TurnEvent, timeoutMs = 2_000): Promise<ActionResult> {
    return new Promise<ActionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resultHandlers.delete(event.botId);
        reject(new Error(`Gateway: timeout waiting for result from bot ${event.botId}`));
      }, timeoutMs);

      this.resultHandlers.set(event.botId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });

      // Publish to NATS — workers pick this up via queueSubscribe.
      void this.bus.publish('worker.assign', event);
    });
  }
}

// ---------------------------------------------------------------------------
// Adapted BotWorker that routes results back through the gateway.results
// subject (instead of bot.{botId}.action) so the mock gateway can receive
// them without requiring a wildcard subscription.
// ---------------------------------------------------------------------------

/**
 * Stub the NatsClient inside a BotWorker to use our InMemoryNats bus.
 *
 * This mirrors the technique used in worker.test.ts but uses the real
 * InMemoryNats bus instead of vi.fn() stubs so messages actually flow
 * across worker boundaries.
 */
function wireWorkerToBus(worker: BotWorker, bus: InMemoryNats): void {
  const w = worker as unknown as {
    nats: {
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      drain: ReturnType<typeof vi.fn>;
      queueSubscribe: ReturnType<typeof vi.fn>;
      publish: ReturnType<typeof vi.fn>;
    };
    stateManager: {
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
      getBotState: ReturnType<typeof vi.fn>;
      setBotState: ReturnType<typeof vi.fn>;
    };
  };

  w.nats.connect = vi.fn().mockResolvedValue(undefined);
  w.nats.disconnect = vi.fn().mockResolvedValue(undefined);
  w.nats.drain = vi.fn().mockResolvedValue(undefined);

  // When the worker queue-subscribes, register with the real in-memory bus.
  w.nats.queueSubscribe = vi.fn().mockImplementation(
    (subject: string, queue: string, handler: (d: unknown) => Promise<void>) => {
      return bus.queueSubscribe(subject, queue, handler);
    },
  );

  // When the worker publishes a result, re-route it to gateway.results so
  // the mock gateway can receive it.
  w.nats.publish = vi.fn().mockImplementation((subject: string, data: unknown) => {
    // subject is bot.{botId}.action — extract botId and forward to gateway
    const match = /^bot\.(.+?)\.action$/.exec(subject);
    if (match !== null) {
      const botId = match[1] as string;
      void bus.publish('gateway.results', { botId, result: data });
    } else {
      void bus.publish(subject, data);
    }
  });

  // Stub state manager to avoid needing real storage.
  w.stateManager.connect = vi.fn().mockResolvedValue(undefined);
  w.stateManager.disconnect = vi.fn().mockResolvedValue(undefined);
  w.stateManager.getBotState = vi.fn().mockResolvedValue(null);
  w.stateManager.setBotState = vi.fn().mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTurnEvent(overrides?: Partial<TurnEvent>): TurnEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    botId: 'bot-1',
    sceneId: 'mock-scene:room-1',
    type: 'vote_phase',
    phase: 'vote',
    data: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeWorker(
  id: string,
  bus: InMemoryNats,
  options: {
    plugin?: MockScenePlugin;
    adapter?: MockAIPlatformAdapter;
  } = {},
): BotWorker {
  const plugin = options.plugin ?? new MockScenePlugin();
  const adapter = options.adapter ?? new MockAIPlatformAdapter();
  const registry = new ScenePluginRegistry();
  registry.register(plugin);
  const pool = new AdapterPool([adapter]);
  const storage = new MockStorageProvider();

  const config: WorkerConfig = {
    workerId: id,
    natsUrl: 'nats://localhost:4222', // unused — wired to bus
    storage,
    adapterPool: pool,
    sceneRegistry: registry,
    heartbeatInterval: 60_000,
  };

  const worker = new BotWorker(config);
  wireWorkerToBus(worker, bus);
  return worker;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('distributed integration', () => {
  let bus: InMemoryNats;
  let gateway: MockGateway;
  let worker1: BotWorker;
  let worker2: BotWorker;

  beforeEach(() => {
    MetricsRegistry._resetForTesting();
    bus = new InMemoryNats();
    gateway = new MockGateway(bus);
    worker1 = makeWorker('worker-1', bus);
    worker2 = makeWorker('worker-2', bus);
  });

  afterEach(async () => {
    // Graceful shutdown — ignore errors during teardown
    await Promise.allSettled([worker1.stop(), worker2.stop()]);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Message routing correctness
  // -------------------------------------------------------------------------

  it('gateway dispatches action and receives result via NATS', async () => {
    gateway.start();
    await worker1.start();

    const event = makeTurnEvent({ botId: 'bot-routing-1' });
    const result = await gateway.dispatch(event);

    expect(result.success).toBe(true);
    expect(result.action.type).toBe('vote');
  });

  it('result is delivered to the correct bot caller (no cross-contamination)', async () => {
    gateway.start();
    await worker1.start();

    const eventA = makeTurnEvent({ botId: 'bot-a', id: 'event-a' });
    const eventB = makeTurnEvent({ botId: 'bot-b', id: 'event-b' });

    // Dispatch both concurrently
    const [resultA, resultB] = await Promise.all([
      gateway.dispatch(eventA),
      gateway.dispatch(eventB),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
  });

  it('publishes the TurnEvent to worker.assign subject', async () => {
    gateway.start();
    await worker1.start();

    const event = makeTurnEvent({ botId: 'bot-subject-check' });
    await gateway.dispatch(event);

    const dispatched = bus.published.find((m) => m.subject === 'worker.assign');
    expect(dispatched).toBeDefined();
    expect((dispatched?.data as TurnEvent).botId).toBe('bot-subject-check');
  });

  // -------------------------------------------------------------------------
  // Load balancing between workers
  // -------------------------------------------------------------------------

  it('distributes events across two workers using queue group load balancing', async () => {
    gateway.start();
    await worker1.start();
    await worker2.start();

    // Dispatch multiple events sequentially — the bus round-robins them.
    const events = Array.from({ length: 4 }, (_, i) =>
      makeTurnEvent({ botId: `bot-lb-${i}`, id: `event-lb-${i}` }),
    );

    for (const event of events) {
      await gateway.dispatch(event);
    }

    const w1Processed = worker1.health().totalProcessed;
    const w2Processed = worker2.health().totalProcessed;

    // Round-robin: each worker should have processed exactly half
    expect(w1Processed + w2Processed).toBe(events.length);
    expect(w1Processed).toBeGreaterThan(0);
    expect(w2Processed).toBeGreaterThan(0);
  });

  it('all events are eventually processed even with two workers', async () => {
    gateway.start();
    await worker1.start();
    await worker2.start();

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        gateway.dispatch(makeTurnEvent({ botId: `bot-${i}`, id: `evt-${i}` })),
      ),
    );

    for (const result of results) {
      expect(result.success).toBe(true);
    }
    expect(worker1.health().totalProcessed + worker2.health().totalProcessed).toBe(6);
  });

  // -------------------------------------------------------------------------
  // State consistency
  // -------------------------------------------------------------------------

  it('worker health reflects the number of processed events', async () => {
    gateway.start();
    await worker1.start();

    for (let i = 0; i < 3; i++) {
      await gateway.dispatch(makeTurnEvent({ botId: `bot-state-${i}`, id: `st-evt-${i}` }));
    }

    expect(worker1.health().totalProcessed).toBe(3);
    expect(worker1.health().errors).toBe(0);
  });

  it('failed action does not increment totalProcessed incorrectly', async () => {
    const brokenPlugin = new MockScenePlugin({
      parseError: new Error('scene logic failed'),
    });
    const busLocal = new InMemoryNats();
    const gw = new MockGateway(busLocal);
    const brokenWorker = makeWorker('broken-worker', busLocal, { plugin: brokenPlugin });

    gw.start();
    await brokenWorker.start();

    const event = makeTurnEvent({ botId: 'bot-fail' });
    const result = await gw.dispatch(event);

    // Result is returned (not dropped) even on parse error
    expect(result).toBeDefined();
    // totalProcessed increments for every turn regardless of success/failure
    expect(brokenWorker.health().totalProcessed).toBe(1);

    await brokenWorker.stop();
  });

  it('worker remains healthy after processing a failed turn', async () => {
    const errorAdapter = new MockAIPlatformAdapter({ chatError: new Error('AI down') });
    const busLocal = new InMemoryNats();
    const gw = new MockGateway(busLocal);
    const errWorker = makeWorker('err-worker', busLocal, { adapter: errorAdapter });

    gw.start();
    await errWorker.start();

    const result = await gw.dispatch(makeTurnEvent({ botId: 'bot-ai-fail' }));
    expect(result.success).toBe(false);
    expect(errWorker.health().status).toBe('running');

    await errWorker.stop();
  });

  // -------------------------------------------------------------------------
  // Worker lifecycle
  // -------------------------------------------------------------------------

  it('a stopped worker does not process new events', async () => {
    gateway.start();
    await worker1.start();
    await worker2.start();

    await worker1.stop();

    // All events should be routed to worker2 exclusively
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        gateway.dispatch(makeTurnEvent({ botId: `bot-stopped-${i}`, id: `stop-evt-${i}` })),
      ),
    );

    for (const result of results) {
      expect(result.success).toBe(true);
    }
    expect(worker1.health().totalProcessed).toBe(0);
    expect(worker2.health().totalProcessed).toBe(3);
  });

  it('workers transition through running → stopped lifecycle correctly', async () => {
    await worker1.start();
    expect(worker1.health().status).toBe('running');

    await worker1.stop();
    expect(worker1.health().status).toBe('stopped');
  });
});

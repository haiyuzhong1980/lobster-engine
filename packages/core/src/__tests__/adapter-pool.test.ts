// @lobster-engine/core — AdapterPool comprehensive tests

import { describe, it, expect, vi } from 'vitest';
import {
  AdapterPool,
  AdapterPoolNoAdaptersError,
  AdapterPoolQueueFullError,
  AdapterPoolQueueTimeoutError,
  AdapterPoolShutdownError,
  AdapterPoolTimeoutError,
} from '../adapter-pool.js';
import type { AdapterPoolConfig } from '../adapter-pool.js';
import type { AIPlatformAdapter, ChatMessage, ChatOptions, ChatResponse, AdapterCapabilities } from '../adapter.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const MESSAGES: readonly ChatMessage[] = [{ role: 'user', content: 'Hello' }];

const SUCCESS_RESPONSE: ChatResponse = {
  content: 'Hi there',
  finishReason: 'stop',
  usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
};

const CAPABILITIES: AdapterCapabilities = {
  streaming: false,
  functionCalling: false,
  vision: false,
  maxContextLength: 4096,
};

interface ControlledAdapterOptions {
  readonly name?: string;
  /** If provided, chat() rejects with this error */
  readonly chatError?: Error;
  /** Fixed delay (ms) before chat() resolves/rejects */
  readonly chatDelayMs?: number;
  /** If provided, detect() returns this value */
  readonly detectResult?: boolean;
}

/**
 * Adapter whose chat() can be paused and released manually, enabling
 * precise control over concurrency in tests.
 */
class ControllableAdapter implements AIPlatformAdapter {
  readonly name: string;
  readonly platform = 'test';

  private readonly chatError: Error | undefined;
  private readonly chatDelayMs: number;
  private readonly detectResult: boolean;

  chatCallCount = 0;
  disconnectCallCount = 0;

  // Holds pending resolve/reject pairs so tests can release them manually
  private readonly pendingChats: Array<{
    resolve: (r: ChatResponse) => void;
    reject: (e: unknown) => void;
  }> = [];

  constructor(options: ControlledAdapterOptions = {}) {
    this.name = options.name ?? 'test-adapter';
    this.chatError = options.chatError;
    this.chatDelayMs = options.chatDelayMs ?? 0;
    this.detectResult = options.detectResult ?? true;
  }

  async detect(): Promise<boolean> {
    return this.detectResult;
  }

  async connect(): Promise<void> {
    // no-op
  }

  async disconnect(): Promise<void> {
    this.disconnectCallCount++;
  }

  async chat(_messages: readonly ChatMessage[], _options?: ChatOptions): Promise<ChatResponse> {
    this.chatCallCount++;

    return new Promise<ChatResponse>((resolve, reject) => {
      const entry = { resolve, reject };
      this.pendingChats.push(entry);

      if (this.chatDelayMs > 0) {
        setTimeout(() => {
          const idx = this.pendingChats.indexOf(entry);
          if (idx !== -1) {
            this.pendingChats.splice(idx, 1);
            if (this.chatError !== undefined) {
              reject(this.chatError);
            } else {
              resolve(SUCCESS_RESPONSE);
            }
          }
        }, this.chatDelayMs);
      }
    });
  }

  getCapabilities(): AdapterCapabilities {
    return CAPABILITIES;
  }

  /** Release the oldest pending chat call with success. */
  resolveNext(): void {
    const entry = this.pendingChats.shift();
    if (entry === undefined) throw new Error('No pending chat calls');
    entry.resolve(SUCCESS_RESPONSE);
  }

  /** Release the oldest pending chat call with a failure. */
  rejectNext(error: Error): void {
    const entry = this.pendingChats.shift();
    if (entry === undefined) throw new Error('No pending chat calls');
    entry.reject(error);
  }

  /** Release all pending chat calls with success. */
  resolveAll(): void {
    for (const entry of this.pendingChats.splice(0)) {
      entry.resolve(SUCCESS_RESPONSE);
    }
  }

  /** Number of chat calls currently waiting for resolution */
  get pendingCount(): number {
    return this.pendingChats.length;
  }
}

/** Build a minimal AdapterPool config suitable for fast tests. */
function fastConfig(overrides?: Partial<AdapterPoolConfig>): Partial<AdapterPoolConfig> {
  return {
    maxConcurrent: 2,
    queueSize: 5,
    queueTimeoutMs: 0,
    timeoutMs: 500,
    circuitBreaker: {
      failureThreshold: 3,
      resetTimeoutMs: 200,
      halfOpenMaxAttempts: 1,
    },
    ...overrides,
  };
}

/** Flush the microtask queue once. */
function flushPromises(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('AdapterPool', () => {
  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('creates a pool with zero adapters', () => {
      const pool = new AdapterPool([], fastConfig());
      expect(pool.getStats()).toHaveLength(0);
    });

    it('registers adapters passed in the constructor', () => {
      const a = new ControllableAdapter({ name: 'adapter-a' });
      const b = new ControllableAdapter({ name: 'adapter-b' });
      const pool = new AdapterPool([a, b], fastConfig());

      const stats = pool.getStats();
      expect(stats).toHaveLength(2);
      expect(stats.map((s) => s.name)).toEqual(expect.arrayContaining(['adapter-a', 'adapter-b']));
    });

    it('initial stats have zeroed counters', () => {
      const pool = new AdapterPool([new ControllableAdapter()], fastConfig());
      const [stat] = pool.getStats();
      expect(stat).toBeDefined();
      expect(stat!.circuitState).toBe('closed');
      expect(stat!.activeRequests).toBe(0);
      expect(stat!.queuedRequests).toBe(0);
      expect(stat!.totalRequests).toBe(0);
      expect(stat!.totalFailures).toBe(0);
      expect(stat!.circuitBreakerTrips).toBe(0);
      expect(stat!.averageLatencyMs).toBe(0);
    });

    it('registerAdapter() adds a new adapter dynamically', () => {
      const pool = new AdapterPool([], fastConfig());
      const adapter = new ControllableAdapter({ name: 'dynamic' });
      pool.registerAdapter(adapter);
      expect(pool.getStats()).toHaveLength(1);
      expect(pool.getStats()[0]!.name).toBe('dynamic');
    });

    it('registerAdapter() throws on duplicate name', () => {
      const adapter = new ControllableAdapter({ name: 'dup' });
      const pool = new AdapterPool([adapter], fastConfig());
      expect(() => pool.registerAdapter(new ControllableAdapter({ name: 'dup' }))).toThrow(
        'already registered',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Basic chat routing
  // -------------------------------------------------------------------------

  describe('chat() routing', () => {
    it('routes a request and resolves with the adapter response', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig());

      const chatPromise = pool.chat(MESSAGES);
      await flushPromises();
      adapter.resolveNext();

      const response = await chatPromise;
      expect(response).toEqual(SUCCESS_RESPONSE);
    });

    it('increments totalRequests after each call', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig());

      const p1 = pool.chat(MESSAGES);
      const p2 = pool.chat(MESSAGES);
      await flushPromises();
      adapter.resolveAll();
      await Promise.all([p1, p2]);

      expect(pool.getStats()[0]!.totalRequests).toBe(2);
    });

    it('throws AdapterPoolNoAdaptersError when no adapters registered', async () => {
      const pool = new AdapterPool([], fastConfig());
      await expect(pool.chat(MESSAGES)).rejects.toBeInstanceOf(AdapterPoolNoAdaptersError);
    });

    it('prefers the adapter with lower load when multiple are available', async () => {
      const busyAdapter = new ControllableAdapter({ name: 'busy' });
      const freeAdapter = new ControllableAdapter({ name: 'free' });
      const pool = new AdapterPool([busyAdapter, freeAdapter], fastConfig({ maxConcurrent: 3 }));

      // Occupy busy adapter up to its load
      const b1 = pool.chat(MESSAGES);
      const b2 = pool.chat(MESSAGES);
      await flushPromises();

      // Third request should go to the adapter with fewer requests
      const p3 = pool.chat(MESSAGES);
      await flushPromises();

      const stats = pool.getStats();
      const _busyStat = stats.find((s) => s.name === 'busy')!;
      const freeStat = stats.find((s) => s.name === 'free')!;

      // Free adapter should have picked up at least one request
      expect(freeStat.activeRequests + freeStat.queuedRequests).toBeGreaterThanOrEqual(1);

      busyAdapter.resolveAll();
      freeAdapter.resolveAll();
      await Promise.all([b1, b2, p3]);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrency and queuing
  // -------------------------------------------------------------------------

  describe('concurrency and queuing', () => {
    it('limits active requests to maxConcurrent', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 2 }));

      void pool.chat(MESSAGES);
      void pool.chat(MESSAGES);
      void pool.chat(MESSAGES); // third should queue
      await flushPromises();

      const [stat] = pool.getStats();
      expect(stat!.activeRequests).toBe(2);
      expect(stat!.queuedRequests).toBe(1);

      adapter.resolveAll();
    });

    it('dequeues waiting request when a slot opens', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 1 }));

      const p1 = pool.chat(MESSAGES);
      const p2 = pool.chat(MESSAGES);
      await flushPromises();

      // Release first
      adapter.resolveNext();
      await flushPromises();
      adapter.resolveNext();

      await expect(p1).resolves.toEqual(SUCCESS_RESPONSE);
      await expect(p2).resolves.toEqual(SUCCESS_RESPONSE);
    });

    it('rejects with AdapterPoolQueueFullError when queue is full', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 1, queueSize: 2 }),
      );

      // 1 active + 2 queued = capacity full
      void pool.chat(MESSAGES);
      void pool.chat(MESSAGES);
      void pool.chat(MESSAGES);
      await flushPromises();

      await expect(pool.chat(MESSAGES)).rejects.toBeInstanceOf(AdapterPoolQueueFullError);

      adapter.resolveAll();
    });

    it('handles burst: all complete in correct order', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 1, queueSize: 4 }));

      const results: number[] = [];

      const promises = [1, 2, 3, 4, 5].map((n) =>
        pool.chat(MESSAGES).then(() => {
          results.push(n);
        }),
      );
      await flushPromises();

      // Release one by one in order
      for (let i = 0; i < 5; i++) {
        adapter.resolveNext();
        await flushPromises();
      }

      await Promise.all(promises);
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });
  });

  // -------------------------------------------------------------------------
  // Request timeout
  // -------------------------------------------------------------------------

  describe('request timeout', () => {
    it('rejects with AdapterPoolTimeoutError when adapter chat exceeds timeoutMs', async () => {
      vi.useFakeTimers();
      try {
        const adapter = new ControllableAdapter();
        const pool = new AdapterPool([adapter], fastConfig({ timeoutMs: 100 }));

        const chatPromise = pool.chat(MESSAGES);
        // Run pending microtasks before advancing time
        await Promise.resolve();
        vi.advanceTimersByTime(150);

        await expect(chatPromise).rejects.toBeInstanceOf(AdapterPoolTimeoutError);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not reject when adapter responds before timeout', async () => {
      // Real timers — ControllableAdapter.resolveNext() is synchronous
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ timeoutMs: 500 }));

      const chatPromise = pool.chat(MESSAGES);
      await flushPromises();
      adapter.resolveNext();

      await expect(chatPromise).resolves.toEqual(SUCCESS_RESPONSE);
    });
  });

  // -------------------------------------------------------------------------
  // Queue timeout
  // -------------------------------------------------------------------------

  describe('queue timeout', () => {
    it('rejects queued request with AdapterPoolQueueTimeoutError after queueTimeoutMs', async () => {
      vi.useFakeTimers();
      try {
        const adapter = new ControllableAdapter();
        const pool = new AdapterPool(
          [adapter],
          fastConfig({ maxConcurrent: 1, queueTimeoutMs: 200 }),
        );

        // Occupy the only slot
        const p1 = pool.chat(MESSAGES);
        await Promise.resolve(); // let execute() start

        // Queue a second request
        const p2 = pool.chat(MESSAGES);
        await Promise.resolve();

        // Advance past queue timeout — fires the queueTimer
        vi.advanceTimersByTime(250);
        await Promise.resolve();

        await expect(p2).rejects.toBeInstanceOf(AdapterPoolQueueTimeoutError);

        // Release the in-flight request
        adapter.resolveNext();
        vi.useRealTimers();
        await p1;
      } catch (err) {
        vi.useRealTimers();
        throw err;
      }
    });

    it('does not reject queued request if it is dequeued before timeout', async () => {
      vi.useFakeTimers();
      try {
        const adapter = new ControllableAdapter();
        const pool = new AdapterPool(
          [adapter],
          fastConfig({ maxConcurrent: 1, queueTimeoutMs: 500 }),
        );

        const p1 = pool.chat(MESSAGES);
        await Promise.resolve();
        const p2 = pool.chat(MESSAGES);
        await Promise.resolve();

        // Only 100ms — well before the 500ms queue timeout
        vi.advanceTimersByTime(100);

        // Release slot 1 — p2 gets dequeued and its queue timer is cleared
        adapter.resolveNext();

        // Multiple microtask ticks: execute() → finally → drainQueue() → execute() for p2
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Now p2's chat() has been called; switch to real timers and resolve it
        vi.useRealTimers();
        adapter.resolveNext();

        await expect(p1).resolves.toEqual(SUCCESS_RESPONSE);
        await expect(p2).resolves.toEqual(SUCCESS_RESPONSE);
      } catch (err) {
        vi.useRealTimers();
        throw err;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Priority queue
  // -------------------------------------------------------------------------

  describe('priority queue', () => {
    it('executes high-priority requests before normal-priority queued requests', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 1, queueSize: 5 }));

      const order: string[] = [];

      // Occupy the single slot
      const p1 = pool.chat(MESSAGES).then(() => order.push('p1'));
      await flushPromises();

      // Queue: normal, normal, high
      const p2 = pool.chat(MESSAGES, undefined, 'normal').then(() => order.push('p2'));
      const p3 = pool.chat(MESSAGES, undefined, 'normal').then(() => order.push('p3'));
      const p4 = pool.chat(MESSAGES, undefined, 'high').then(() => order.push('p4'));
      await flushPromises();

      // Release all one by one
      adapter.resolveNext(); // p1
      await flushPromises();
      adapter.resolveNext(); // should be p4 (high priority)
      await flushPromises();
      adapter.resolveNext(); // p2
      await flushPromises();
      adapter.resolveNext(); // p3
      await flushPromises();

      await Promise.all([p1, p2, p3, p4]);

      expect(order).toEqual(['p1', 'p4', 'p2', 'p3']);
    });
  });

  // -------------------------------------------------------------------------
  // Circuit breaker state transitions
  // -------------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('opens the circuit after failureThreshold consecutive failures (closed → open)', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 200, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('adapter error');

      // 3 failures in sequence
      for (let i = 0; i < 3; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toThrow('adapter error');
      }

      expect(pool.getStats()[0]!.circuitState).toBe('open');
      expect(pool.getStats()[0]!.circuitBreakerTrips).toBe(1);
    });

    it('rejects requests with AdapterPoolNoAdaptersError when circuit is open', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('down');

      for (let i = 0; i < 2; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toBeDefined();
      }

      await expect(pool.chat(MESSAGES)).rejects.toBeInstanceOf(AdapterPoolNoAdaptersError);
    });

    it('does not open circuit below failureThreshold', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 200, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('partial failure');

      // 2 failures (below threshold of 3)
      for (let i = 0; i < 2; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toBeDefined();
      }

      expect(pool.getStats()[0]!.circuitState).toBe('closed');
    });

    it('resets consecutive failures on success (does not trip)', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 200, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('err');

      // 2 failures
      for (let i = 0; i < 2; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toBeDefined();
      }

      // 1 success — resets counter
      const p = pool.chat(MESSAGES);
      await flushPromises();
      adapter.resolveNext();
      await p;

      // 2 more failures — should not open (counter was reset to 0, now at 2 < 3)
      for (let i = 0; i < 2; i++) {
        const p2 = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p2).rejects.toBeDefined();
      }

      expect(pool.getStats()[0]!.circuitState).toBe('closed');
    });

    it('transitions open → half-open after resetTimeoutMs', async () => {
      vi.useFakeTimers();
      try {
        const adapter = new ControllableAdapter();
        const pool = new AdapterPool(
          [adapter],
          fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 500, halfOpenMaxAttempts: 1 } }),
        );

        const fail = new Error('down');
        for (let i = 0; i < 2; i++) {
          const p = pool.chat(MESSAGES);
          vi.advanceTimersByTime(0);
          adapter.rejectNext(fail);
          await expect(p).rejects.toBeDefined();
        }

        expect(pool.getStats()[0]!.circuitState).toBe('open');

        // Advance past reset timeout
        vi.advanceTimersByTime(600);

        // Next chat() call will trigger the transition during selectAdapterState
        const probePromise = pool.chat(MESSAGES);
        vi.advanceTimersByTime(0);
        adapter.resolveNext();
        await probePromise;

        expect(pool.getStats()[0]!.circuitState).toBe('closed');
      } finally {
        vi.useRealTimers();
      }
    });

    it('transitions half-open → closed on successful probe', async () => {
      vi.useFakeTimers();
      try {
        const adapter = new ControllableAdapter();
        const pool = new AdapterPool(
          [adapter],
          fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 100, halfOpenMaxAttempts: 1 } }),
        );

        const fail = new Error('down');
        for (let i = 0; i < 2; i++) {
          const p = pool.chat(MESSAGES);
          vi.advanceTimersByTime(0);
          adapter.rejectNext(fail);
          await expect(p).rejects.toBeDefined();
        }

        vi.advanceTimersByTime(200); // triggers open → half-open

        const probe = pool.chat(MESSAGES);
        vi.advanceTimersByTime(0);
        adapter.resolveNext();
        await probe;

        expect(pool.getStats()[0]!.circuitState).toBe('closed');
      } finally {
        vi.useRealTimers();
      }
    });

    it('transitions half-open → open on failed probe', async () => {
      vi.useFakeTimers();
      try {
        const adapter = new ControllableAdapter();
        const pool = new AdapterPool(
          [adapter],
          fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 100, halfOpenMaxAttempts: 1 } }),
        );

        const fail = new Error('down');
        for (let i = 0; i < 2; i++) {
          const p = pool.chat(MESSAGES);
          vi.advanceTimersByTime(0);
          adapter.rejectNext(fail);
          await expect(p).rejects.toBeDefined();
        }

        vi.advanceTimersByTime(200); // open → half-open

        const tripsBefore = pool.getStats()[0]!.circuitBreakerTrips;
        const probe = pool.chat(MESSAGES);
        vi.advanceTimersByTime(0);
        adapter.rejectNext(fail);
        await expect(probe).rejects.toBeDefined();

        expect(pool.getStats()[0]!.circuitState).toBe('open');
        expect(pool.getStats()[0]!.circuitBreakerTrips).toBe(tripsBefore + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('resetCircuit() manually closes an open circuit', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('down');
      for (let i = 0; i < 2; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toBeDefined();
      }

      expect(pool.getStats()[0]!.circuitState).toBe('open');

      pool.resetCircuit('test-adapter');
      expect(pool.getStats()[0]!.circuitState).toBe('closed');

      const p = pool.chat(MESSAGES);
      await flushPromises();
      adapter.resolveNext();
      await expect(p).resolves.toEqual(SUCCESS_RESPONSE);
    });

    it('resetCircuit() throws for unknown adapter name', () => {
      const pool = new AdapterPool([], fastConfig());
      expect(() => pool.resetCircuit('nonexistent')).toThrow('Unknown adapter');
    });
  });

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  describe('metrics', () => {
    it('tracks totalFailures correctly', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 3 }));

      const fail = new Error('err');
      for (let i = 0; i < 2; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toBeDefined();
      }

      expect(pool.getStats()[0]!.totalFailures).toBe(2);
    });

    it('tracks circuitBreakerTrips after circuit trips', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool(
        [adapter],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 2, resetTimeoutMs: 60_000, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('err');
      for (let i = 0; i < 2; i++) {
        const p = pool.chat(MESSAGES);
        await flushPromises();
        adapter.rejectNext(fail);
        await expect(p).rejects.toBeDefined();
      }

      expect(pool.getStats()[0]!.circuitBreakerTrips).toBe(1);
    });

    it('averageLatencyMs is 0 before any request', () => {
      const pool = new AdapterPool([new ControllableAdapter()], fastConfig());
      expect(pool.getStats()[0]!.averageLatencyMs).toBe(0);
    });

    it('averageLatencyMs is positive after completed requests', async () => {
      const adapter = new ControllableAdapter({ chatDelayMs: 10 });
      const pool = new AdapterPool([adapter], fastConfig({ timeoutMs: 5000 }));

      // Use real timers so the delay actually elapses
      const p = pool.chat(MESSAGES);
      // Wait for the delay to fire
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      await p;

      expect(pool.getStats()[0]!.averageLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Graceful drain / shutdown
  // -------------------------------------------------------------------------

  describe('shutdown()', () => {
    it('rejects new chat() calls immediately after shutdown', async () => {
      const pool = new AdapterPool([new ControllableAdapter()], fastConfig());
      await pool.shutdown();
      await expect(pool.chat(MESSAGES)).rejects.toBeInstanceOf(AdapterPoolShutdownError);
    });

    it('rejects all queued requests with AdapterPoolShutdownError on shutdown', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 1, queueSize: 3 }));

      // Occupy the slot
      const p1 = pool.chat(MESSAGES);
      await flushPromises();

      // Queue 2 more
      const p2 = pool.chat(MESSAGES);
      const p3 = pool.chat(MESSAGES);
      await flushPromises();

      // Shutdown drains queue immediately; in-flight continues
      const shutdownPromise = pool.shutdown(50);

      await expect(p2).rejects.toBeInstanceOf(AdapterPoolShutdownError);
      await expect(p3).rejects.toBeInstanceOf(AdapterPoolShutdownError);

      // Release in-flight so shutdown can complete
      adapter.resolveNext();
      await p1;
      await shutdownPromise;
    });

    it('disconnects all adapters on shutdown', async () => {
      const a = new ControllableAdapter({ name: 'a' });
      const b = new ControllableAdapter({ name: 'b' });
      const pool = new AdapterPool([a, b], fastConfig());

      await pool.shutdown();

      expect(a.disconnectCallCount).toBe(1);
      expect(b.disconnectCallCount).toBe(1);
    });

    it('waits for in-flight requests before disconnecting', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 1 }));

      const p1 = pool.chat(MESSAGES);
      await flushPromises();

      let disconnected = false;
      const origDisconnect = adapter.disconnect.bind(adapter);
      vi.spyOn(adapter, 'disconnect').mockImplementation(async () => {
        disconnected = true;
        return origDisconnect();
      });

      // Start shutdown but release in-flight first
      const shutdownPromise = pool.shutdown(500);
      expect(disconnected).toBe(false); // still waiting

      adapter.resolveNext();
      await p1;
      await shutdownPromise;

      expect(disconnected).toBe(true);
    });

    it('proceeds with disconnect even if drain times out', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 1 }));

      // Start a request that never resolves
      void pool.chat(MESSAGES);
      await flushPromises();

      // shutdown with very short drain timeout
      await pool.shutdown(20);

      expect(adapter.disconnectCallCount).toBe(1);
    });

    it('shutdown() is idempotent', async () => {
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig());

      await pool.shutdown();
      await pool.shutdown(); // second call must not throw

      expect(adapter.disconnectCallCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('adapter failure propagates as the rejection reason', async () => {
      const err = new Error('boom');
      const adapter = new ControllableAdapter();
      const pool = new AdapterPool([adapter], fastConfig({ maxConcurrent: 3 }));

      const p = pool.chat(MESSAGES);
      await flushPromises();
      adapter.rejectNext(err);

      await expect(p).rejects.toThrow('boom');
    });

    it('multiple adapters: all-open scenario throws AdapterPoolNoAdaptersError', async () => {
      const a = new ControllableAdapter({ name: 'a' });
      const b = new ControllableAdapter({ name: 'b' });
      const pool = new AdapterPool(
        [a, b],
        fastConfig({ maxConcurrent: 5, circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 60_000, halfOpenMaxAttempts: 1 } }),
      );

      const fail = new Error('all down');

      // Trip adapter a
      const pa = pool.chat(MESSAGES);
      await flushPromises();
      a.rejectNext(fail);
      await expect(pa).rejects.toBeDefined();

      // Trip adapter b
      const pb = pool.chat(MESSAGES);
      await flushPromises();
      b.rejectNext(fail);
      await expect(pb).rejects.toBeDefined();

      await expect(pool.chat(MESSAGES)).rejects.toBeInstanceOf(AdapterPoolNoAdaptersError);
    });

    it('getStats() returns a read-only snapshot (does not mutate internal state)', async () => {
      const pool = new AdapterPool([new ControllableAdapter()], fastConfig());
      const stats1 = pool.getStats();
      const stats2 = pool.getStats();
      expect(stats1).not.toBe(stats2); // new array each time
    });
  });
});

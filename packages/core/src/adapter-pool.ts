// @lobster-engine/core — AdapterPool with connection pooling, queuing, and circuit breaker

import type { AIPlatformAdapter, ChatMessage, ChatOptions, ChatResponse } from './adapter.js';

// ---------------------------------------------------------------------------
// Public configuration types
// ---------------------------------------------------------------------------

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly halfOpenMaxAttempts: number;
}

export interface AdapterPoolConfig {
  readonly maxConcurrent: number;
  readonly queueSize: number;
  readonly queueTimeoutMs: number;
  readonly circuitBreaker: CircuitBreakerConfig;
  readonly timeoutMs: number;
  readonly healthCheckIntervalMs: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export type RequestPriority = 'normal' | 'high';

export interface AdapterStats {
  readonly name: string;
  readonly circuitState: CircuitState;
  readonly activeRequests: number;
  readonly queuedRequests: number;
  readonly totalRequests: number;
  readonly totalFailures: number;
  readonly circuitBreakerTrips: number;
  readonly averageLatencyMs: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AdapterPoolQueueFullError extends Error {
  constructor(adapterName: string) {
    super(`Adapter pool queue is full for adapter "${adapterName}". Try again later.`);
    this.name = 'AdapterPoolQueueFullError';
  }
}

export class AdapterPoolCircuitOpenError extends Error {
  constructor(adapterName: string) {
    super(
      `Circuit breaker is open for adapter "${adapterName}". Requests are temporarily rejected.`,
    );
    this.name = 'AdapterPoolCircuitOpenError';
  }
}

export class AdapterPoolTimeoutError extends Error {
  constructor(adapterName: string, timeoutMs: number) {
    super(`Request to adapter "${adapterName}" timed out after ${timeoutMs}ms.`);
    this.name = 'AdapterPoolTimeoutError';
  }
}

export class AdapterPoolQueueTimeoutError extends Error {
  constructor(adapterName: string, timeoutMs: number) {
    super(
      `Request to adapter "${adapterName}" timed out after waiting ${timeoutMs}ms in queue.`,
    );
    this.name = 'AdapterPoolQueueTimeoutError';
  }
}

export class AdapterPoolNoAdaptersError extends Error {
  constructor() {
    super('No healthy adapters are available in the pool. All circuits are open.');
    this.name = 'AdapterPoolNoAdaptersError';
  }
}

export class AdapterPoolShutdownError extends Error {
  constructor() {
    super('AdapterPool has been shut down and is no longer accepting requests.');
    this.name = 'AdapterPoolShutdownError';
  }
}

// ---------------------------------------------------------------------------
// Internal per-adapter state
// ---------------------------------------------------------------------------

interface QueueEntry {
  readonly messages: readonly ChatMessage[];
  readonly options: ChatOptions | undefined;
  readonly priority: RequestPriority;
  readonly resolve: (response: ChatResponse) => void;
  readonly reject: (error: unknown) => void;
  readonly queueTimer: ReturnType<typeof setTimeout> | undefined;
}

interface AdapterState {
  readonly adapter: AIPlatformAdapter;
  circuitState: CircuitState;
  consecutiveFailures: number;
  halfOpenAttempts: number;
  openSince: number;
  activeRequests: number;
  totalRequests: number;
  totalFailures: number;
  circuitBreakerTrips: number;
  totalLatencyMs: number;
  readonly queue: QueueEntry[];
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AdapterPoolConfig = {
  maxConcurrent: 10,
  queueSize: 100,
  queueTimeoutMs: 0, // 0 = no queue timeout
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60_000,
    halfOpenMaxAttempts: 2,
  },
  timeoutMs: 30_000,
  healthCheckIntervalMs: 0, // 0 = no health checks
};

// ---------------------------------------------------------------------------
// AdapterPool
// ---------------------------------------------------------------------------

/**
 * Manages a pool of AIPlatformAdapters with:
 * - Per-adapter concurrency limits and FIFO queuing with priority support
 * - Per-adapter circuit breakers (closed → open → half-open → closed)
 * - Per-request and per-queued-entry timeouts
 * - Load balancing: prefer the adapter with the fewest active requests
 * - Periodic health checks (optional)
 * - Graceful drain on shutdown
 * - Dynamic adapter registration
 */
export class AdapterPool {
  private readonly config: AdapterPoolConfig;
  private readonly states: Map<string, AdapterState>;
  private isShutdown = false;
  private healthCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(adapters: readonly AIPlatformAdapter[], config?: Partial<AdapterPoolConfig>) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? DEFAULT_CONFIG.maxConcurrent,
      queueSize: config?.queueSize ?? DEFAULT_CONFIG.queueSize,
      queueTimeoutMs: config?.queueTimeoutMs ?? DEFAULT_CONFIG.queueTimeoutMs,
      timeoutMs: config?.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
      healthCheckIntervalMs:
        config?.healthCheckIntervalMs ?? DEFAULT_CONFIG.healthCheckIntervalMs,
      circuitBreaker: {
        failureThreshold:
          config?.circuitBreaker?.failureThreshold ??
          DEFAULT_CONFIG.circuitBreaker.failureThreshold,
        resetTimeoutMs:
          config?.circuitBreaker?.resetTimeoutMs ?? DEFAULT_CONFIG.circuitBreaker.resetTimeoutMs,
        halfOpenMaxAttempts:
          config?.circuitBreaker?.halfOpenMaxAttempts ??
          DEFAULT_CONFIG.circuitBreaker.halfOpenMaxAttempts,
      },
    };

    this.states = new Map(adapters.map((adapter) => [adapter.name, this.makeState(adapter)]));

    if (this.config.healthCheckIntervalMs > 0) {
      this.healthCheckTimer = setInterval(() => {
        void this.runHealthChecks();
      }, this.config.healthCheckIntervalMs);
      // Allow Node.js to exit even if health checks are pending
      this.healthCheckTimer.unref?.();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Dynamically register a new adapter into the pool.
   * Throws if an adapter with the same name already exists.
   */
  registerAdapter(adapter: AIPlatformAdapter): this {
    if (this.states.has(adapter.name)) {
      throw new Error(`Adapter "${adapter.name}" is already registered in the pool.`);
    }
    this.states.set(adapter.name, this.makeState(adapter));
    return this;
  }

  /**
   * Route a chat request to the best available adapter.
   *
   * Selection criteria (in order):
   * 1. Skip adapters whose circuit is `open` and reset timeout has not elapsed.
   * 2. Transition `open` → `half-open` when the reset timeout has elapsed.
   * 3. Skip `half-open` adapters that have already consumed all trial slots.
   * 4. Among eligible adapters, pick the one with the fewest active + queued requests.
   *
   * If the chosen adapter is at capacity, the request is queued (up to queueSize).
   * High-priority requests are placed ahead of normal-priority items in the queue.
   */
  async chat(
    messages: readonly ChatMessage[],
    options?: ChatOptions,
    priority: RequestPriority = 'normal',
  ): Promise<ChatResponse> {
    if (this.isShutdown) {
      throw new AdapterPoolShutdownError();
    }

    const state = this.selectAdapterState();
    return this.enqueue(state, messages, options, priority);
  }

  /**
   * Returns a snapshot of per-adapter statistics.
   */
  getStats(): ReadonlyArray<AdapterStats> {
    return Array.from(this.states.values()).map((s) => ({
      name: s.adapter.name,
      circuitState: this.peekCircuitState(s),
      activeRequests: s.activeRequests,
      queuedRequests: s.queue.length,
      totalRequests: s.totalRequests,
      totalFailures: s.totalFailures,
      circuitBreakerTrips: s.circuitBreakerTrips,
      averageLatencyMs: s.totalRequests > 0 ? Math.round(s.totalLatencyMs / s.totalRequests) : 0,
    }));
  }

  /**
   * Manually reset the circuit breaker for the named adapter back to `closed`.
   */
  resetCircuit(adapterName: string): void {
    const state = this.states.get(adapterName);
    if (state === undefined) {
      throw new Error(`Unknown adapter "${adapterName}" in AdapterPool.`);
    }
    state.circuitState = 'closed';
    state.consecutiveFailures = 0;
    state.halfOpenAttempts = 0;
    state.openSince = 0;
  }

  /**
   * Graceful drain:
   * 1. Stop accepting new requests (isShutdown = true).
   * 2. Reject all queued-but-not-yet-started entries immediately.
   * 3. Wait for all in-flight requests to complete (or timeout).
   * 4. Stop health-check timer.
   * 5. Disconnect all adapters.
   *
   * @param drainTimeoutMs Maximum ms to wait for in-flight requests to finish
   *                       before forcibly proceeding with disconnect.
   *                       Defaults to the pool's configured timeoutMs.
   */
  async shutdown(drainTimeoutMs?: number): Promise<void> {
    this.isShutdown = true;

    // Stop health-check timer
    if (this.healthCheckTimer !== undefined) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Reject all queued entries
    for (const state of this.states.values()) {
      for (const entry of state.queue) {
        if (entry.queueTimer !== undefined) {
          clearTimeout(entry.queueTimer);
        }
        entry.reject(new AdapterPoolShutdownError());
      }
      state.queue.length = 0;
    }

    // Wait for in-flight requests to settle
    const waitMs = drainTimeoutMs ?? this.config.timeoutMs;
    await this.drainInFlight(waitMs);

    // Disconnect all adapters in parallel; ignore individual errors
    await Promise.allSettled(
      Array.from(this.states.values()).map((s) => s.adapter.disconnect()),
    );
  }

  // ---------------------------------------------------------------------------
  // Internal: factory
  // ---------------------------------------------------------------------------

  private makeState(adapter: AIPlatformAdapter): AdapterState {
    return {
      adapter,
      circuitState: 'closed',
      consecutiveFailures: 0,
      halfOpenAttempts: 0,
      openSince: 0,
      activeRequests: 0,
      totalRequests: 0,
      totalFailures: 0,
      circuitBreakerTrips: 0,
      totalLatencyMs: 0,
      queue: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: graceful drain
  // ---------------------------------------------------------------------------

  private drainInFlight(waitMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const deadline = Date.now() + waitMs;
      const poll = (): void => {
        const hasInFlight = Array.from(this.states.values()).some((s) => s.activeRequests > 0);
        if (!hasInFlight) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          resolve(); // Timeout: proceed regardless
          return;
        }
        setTimeout(poll, 10);
      };
      poll();
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: health checks
  // ---------------------------------------------------------------------------

  private async runHealthChecks(): Promise<void> {
    for (const state of this.states.values()) {
      if (state.circuitState !== 'open') {
        continue;
      }
      try {
        const healthy = await state.adapter.detect();
        if (healthy) {
          // Promote to half-open so next request can probe it
          state.circuitState = 'half-open';
          state.halfOpenAttempts = 0;
        }
      } catch {
        // Silently ignore — circuit stays open
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: adapter selection
  // ---------------------------------------------------------------------------

  private selectAdapterState(): AdapterState {
    const candidates: AdapterState[] = [];

    for (const state of this.states.values()) {
      const effective = this.effectiveCircuitState(state);

      if (effective === 'open') {
        continue;
      }

      if (effective === 'half-open') {
        if (state.halfOpenAttempts >= this.config.circuitBreaker.halfOpenMaxAttempts) {
          continue;
        }
      }

      candidates.push(state);
    }

    if (candidates.length === 0) {
      throw new AdapterPoolNoAdaptersError();
    }

    // Pick the adapter with the lowest active+queued request count
    return candidates.reduce((best, current) => {
      const bestLoad = best.activeRequests + best.queue.length;
      const currentLoad = current.activeRequests + current.queue.length;
      return currentLoad < bestLoad ? current : best;
    });
  }

  // ---------------------------------------------------------------------------
  // Internal: circuit breaker state transitions
  // ---------------------------------------------------------------------------

  /**
   * Computes the effective circuit state, performing the open→half-open
   * transition as a side-effect when the reset timeout has elapsed.
   * This mutates state — call only from code that needs transition logic.
   */
  private effectiveCircuitState(state: AdapterState): CircuitState {
    if (
      state.circuitState === 'open' &&
      Date.now() - state.openSince >= this.config.circuitBreaker.resetTimeoutMs
    ) {
      state.circuitState = 'half-open';
      state.halfOpenAttempts = 0;
    }
    return state.circuitState;
  }

  /**
   * Returns the circuit state for display purposes only.
   * Does NOT perform any state transitions.
   */
  private peekCircuitState(state: AdapterState): CircuitState {
    return state.circuitState;
  }

  private recordSuccess(state: AdapterState): void {
    state.consecutiveFailures = 0;
    if (state.circuitState === 'half-open') {
      state.circuitState = 'closed';
      state.halfOpenAttempts = 0;
    }
  }

  private recordFailure(state: AdapterState): void {
    state.totalFailures++;
    state.consecutiveFailures++;

    if (state.circuitState === 'half-open') {
      // Any failure in half-open immediately reopens the circuit
      state.circuitState = 'open';
      state.openSince = Date.now();
      state.halfOpenAttempts = 0;
      state.circuitBreakerTrips++;
      return;
    }

    if (
      state.circuitState === 'closed' &&
      state.consecutiveFailures >= this.config.circuitBreaker.failureThreshold
    ) {
      state.circuitState = 'open';
      state.openSince = Date.now();
      state.circuitBreakerTrips++;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: queuing and execution
  // ---------------------------------------------------------------------------

  private enqueue(
    state: AdapterState,
    messages: readonly ChatMessage[],
    options: ChatOptions | undefined,
    priority: RequestPriority,
  ): Promise<ChatResponse> {
    return new Promise<ChatResponse>((resolve, reject) => {
      if (state.activeRequests < this.config.maxConcurrent) {
        void this.execute(state, messages, options, resolve, reject);
        return;
      }

      if (state.queue.length >= this.config.queueSize) {
        reject(new AdapterPoolQueueFullError(state.adapter.name));
        return;
      }

      // Build the entry — timer is set after we know the entry reference
      let queueTimer: ReturnType<typeof setTimeout> | undefined;

      const entry: QueueEntry = {
        messages,
        options,
        priority,
        resolve,
        reject,
        get queueTimer() {
          return queueTimer;
        },
      };

      if (this.config.queueTimeoutMs > 0) {
        queueTimer = setTimeout(() => {
          const idx = state.queue.indexOf(entry);
          if (idx !== -1) {
            state.queue.splice(idx, 1);
            reject(
              new AdapterPoolQueueTimeoutError(state.adapter.name, this.config.queueTimeoutMs),
            );
          }
        }, this.config.queueTimeoutMs);
      }

      // High-priority: insert before first normal-priority entry
      if (priority === 'high') {
        const insertAt = state.queue.findIndex((e) => e.priority === 'normal');
        if (insertAt === -1) {
          state.queue.push(entry);
        } else {
          state.queue.splice(insertAt, 0, entry);
        }
      } else {
        state.queue.push(entry);
      }
    });
  }

  private async execute(
    state: AdapterState,
    messages: readonly ChatMessage[],
    options: ChatOptions | undefined,
    resolve: (response: ChatResponse) => void,
    reject: (error: unknown) => void,
  ): Promise<void> {
    state.activeRequests++;
    state.totalRequests++;

    if (state.circuitState === 'half-open') {
      state.halfOpenAttempts++;
    }

    const startTime = Date.now();

    try {
      const response = await this.callWithTimeout(state, messages, options);
      state.totalLatencyMs += Date.now() - startTime;
      this.recordSuccess(state);
      resolve(response);
    } catch (error: unknown) {
      state.totalLatencyMs += Date.now() - startTime;
      this.recordFailure(state);
      reject(error);
    } finally {
      state.activeRequests--;
      this.drainQueue(state);
    }
  }

  private callWithTimeout(
    state: AdapterState,
    messages: readonly ChatMessage[],
    options: ChatOptions | undefined,
  ): Promise<ChatResponse> {
    return new Promise<ChatResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AdapterPoolTimeoutError(state.adapter.name, this.config.timeoutMs));
      }, this.config.timeoutMs);

      state.adapter
        .chat(messages, options)
        .then((response) => {
          clearTimeout(timer);
          resolve(response);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * When a slot becomes available, dequeue the next waiting request (if any).
   * Clears the queue-timeout timer for the dequeued entry before executing it.
   */
  private drainQueue(state: AdapterState): void {
    if (this.isShutdown || state.queue.length === 0) {
      return;
    }

    if (state.activeRequests >= this.config.maxConcurrent) {
      return;
    }

    const next = state.queue.shift();
    if (next === undefined) {
      return;
    }

    if (next.queueTimer !== undefined) {
      clearTimeout(next.queueTimer);
    }

    void this.execute(state, next.messages, next.options, next.resolve, next.reject);
  }
}

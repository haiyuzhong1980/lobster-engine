// @lobster-engine/core — Health check and worker heartbeat monitoring

import type { LobsterEngine } from './engine.js';
import type { StorageProvider } from './storage.js';
import type { NatsClient } from './nats.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HealthOverallStatus = 'healthy' | 'degraded' | 'unhealthy';
export type HealthCheckStatus = 'pass' | 'fail' | 'warn';

export interface HealthCheck {
  readonly name: string;
  readonly status: HealthCheckStatus;
  readonly latency?: number;
  readonly message?: string;
}

export interface HealthStatus {
  readonly status: HealthOverallStatus;
  readonly uptime: number;
  readonly timestamp: string;
  readonly checks: readonly HealthCheck[];
}

/** Payload published to `system.health` by each worker. */
export interface WorkerHeartbeatPayload {
  readonly workerId: string;
  readonly timestamp: number;
  readonly activeBots: number;
  readonly cpuUsage: number;
  readonly memUsage: number;
  /** Optional lifecycle flag set during graceful shutdown. */
  readonly status?: 'running' | 'shutting_down';
}

/** Live record tracked by the Gateway for each known worker. */
export interface WorkerRecord {
  readonly lastSeen: Date;
  readonly healthy: boolean;
  readonly payload: WorkerHeartbeatPayload;
}

// ---------------------------------------------------------------------------
// Checker function signature
// ---------------------------------------------------------------------------

/** A user-supplied health check that returns a single {@link HealthCheck}. */
export type HealthChecker = () => Promise<HealthCheck>;

// ---------------------------------------------------------------------------
// Memory-usage helper (no external deps)
// ---------------------------------------------------------------------------

interface MemorySnapshot {
  readonly heapUsedMb: number;
  readonly heapTotalMb: number;
  readonly usedRatio: number;
}

function sampleMemory(): MemorySnapshot {
  const mem = process.memoryUsage();
  const heapUsedMb = mem.heapUsed / 1_048_576;
  const heapTotalMb = mem.heapTotal / 1_048_576;
  const usedRatio = heapTotalMb > 0 ? heapUsedMb / heapTotalMb : 0;
  return { heapUsedMb, heapTotalMb, usedRatio };
}

// ---------------------------------------------------------------------------
// Event-loop lag helper
// ---------------------------------------------------------------------------

/**
 * Measures event-loop lag by scheduling a zero-delay timer and measuring
 * how long the actual delay exceeds the requested 0 ms.
 */
function measureEventLoopLag(): Promise<number> {
  return new Promise<number>((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      resolve(Date.now() - start);
    });
  });
}

// ---------------------------------------------------------------------------
// Built-in check factories
// ---------------------------------------------------------------------------

/** Check whether a StorageProvider is reachable. */
function makeStorageCheck(storage: StorageProvider): HealthChecker {
  return async (): Promise<HealthCheck> => {
    const start = Date.now();
    try {
      const ok = await storage.health();
      const latency = Date.now() - start;
      return ok
        ? { name: `storage:${storage.name}`, status: 'pass', latency }
        : {
            name: `storage:${storage.name}`,
            status: 'fail',
            latency,
            message: 'storage.health() returned false',
          };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        name: `storage:${storage.name}`,
        status: 'fail',
        latency: Date.now() - start,
        message: msg,
      };
    }
  };
}

/** Check whether the NATS connection is live. */
function makeNatsCheck(nats: NatsClient): HealthChecker {
  return async (): Promise<HealthCheck> => {
    const info = nats.health();
    if (!info.connected) {
      return {
        name: 'nats',
        status: 'fail',
        message: 'NATS connection is not established',
      };
    }
    return {
      name: 'nats',
      status: 'pass',
      message: info.server,
    };
  };
}

/** Check memory usage; warn > 80%, fail > 95%. */
function makeMemoryCheck(): HealthChecker {
  return async (): Promise<HealthCheck> => {
    const snap = sampleMemory();
    const pct = Math.round(snap.usedRatio * 100);
    const msg = `heap ${snap.heapUsedMb.toFixed(1)} MB / ${snap.heapTotalMb.toFixed(1)} MB (${pct}%)`;

    if (snap.usedRatio >= 0.95) {
      return { name: 'memory', status: 'fail', message: msg };
    }
    if (snap.usedRatio >= 0.8) {
      return { name: 'memory', status: 'warn', message: msg };
    }
    return { name: 'memory', status: 'pass', message: msg };
  };
}

/** Check event-loop lag; warn > 100 ms, fail > 500 ms. */
function makeEventLoopCheck(): HealthChecker {
  return async (): Promise<HealthCheck> => {
    const lag = await measureEventLoopLag();
    if (lag >= 500) {
      return {
        name: 'event_loop',
        status: 'fail',
        latency: lag,
        message: `event loop lag ${lag} ms`,
      };
    }
    if (lag >= 100) {
      return {
        name: 'event_loop',
        status: 'warn',
        latency: lag,
        message: `event loop lag ${lag} ms`,
      };
    }
    return { name: 'event_loop', status: 'pass', latency: lag };
  };
}

/** Check that at least one AI adapter is registered. */
function makeAdapterCheck(engine: LobsterEngine): HealthChecker {
  return async (): Promise<HealthCheck> => {
    const adapters = engine.adapters.list();
    if (adapters.length === 0) {
      return {
        name: 'ai_adapters',
        status: 'warn',
        message: 'no AI adapters registered',
      };
    }
    return {
      name: 'ai_adapters',
      status: 'pass',
      message: `${adapters.length} adapter(s) registered`,
    };
  };
}

// ---------------------------------------------------------------------------
// Aggregate status computation
// ---------------------------------------------------------------------------

function aggregateStatus(checks: readonly HealthCheck[]): HealthOverallStatus {
  if (checks.some((c) => c.status === 'fail')) return 'unhealthy';
  if (checks.some((c) => c.status === 'warn')) return 'degraded';
  return 'healthy';
}

// ---------------------------------------------------------------------------
// HealthMonitor
// ---------------------------------------------------------------------------

export interface HealthMonitorOptions {
  /** Optional NATS client to include a connectivity check. */
  readonly nats?: NatsClient;
  /** Optional storage provider to include a connectivity check. */
  readonly storage?: StorageProvider;
  /**
   * Default heartbeat interval in milliseconds for worker mode.
   * Defaults to 10 000 (10 s).
   */
  readonly heartbeatInterval?: number;
  /**
   * Time in milliseconds after which a worker is considered unhealthy
   * if no heartbeat has been received.
   * Defaults to 30 000 (30 s).
   */
  readonly workerTimeout?: number;
}

/**
 * Manages health checks, worker heartbeats, and worker liveness tracking.
 *
 * Typical Gateway usage:
 * ```typescript
 * const monitor = new HealthMonitor(engine, { nats, storage });
 * monitor.monitorWorkers();
 * const status = await monitor.check();
 * ```
 *
 * Typical Worker usage:
 * ```typescript
 * const monitor = new HealthMonitor(engine, { nats });
 * monitor.startHeartbeat();
 * // on shutdown:
 * monitor.stopHeartbeat();
 * ```
 */
export class HealthMonitor {
  private readonly engine: LobsterEngine;
  private readonly nats: NatsClient | undefined;
  private readonly storage: StorageProvider | undefined;
  private readonly heartbeatIntervalMs: number;
  private readonly workerTimeoutMs: number;
  private readonly startTime = Date.now();

  private readonly checkers: Map<string, HealthChecker> = new Map();

  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private workerMonitorTimer: ReturnType<typeof setInterval> | undefined;
  private readonly workers: Map<string, WorkerRecord> = new Map();

  constructor(engine: LobsterEngine, options: HealthMonitorOptions = {}) {
    this.engine = engine;
    this.nats = options.nats;
    this.storage = options.storage;
    this.heartbeatIntervalMs = options.heartbeatInterval ?? 10_000;
    this.workerTimeoutMs = options.workerTimeout ?? 30_000;

    this.registerBuiltinChecks();
  }

  // -------------------------------------------------------------------------
  // Check registration
  // -------------------------------------------------------------------------

  /**
   * Register a named health check. If a check with the same name already
   * exists it will be replaced.
   */
  registerCheck(name: string, checker: HealthChecker): void {
    this.checkers.set(name, checker);
  }

  // -------------------------------------------------------------------------
  // Running checks
  // -------------------------------------------------------------------------

  /** Execute all registered health checks and return an aggregated status. */
  async check(): Promise<HealthStatus> {
    const results = await Promise.all(
      Array.from(this.checkers.entries()).map(async ([, checker]) => {
        try {
          return await checker();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // If the checker itself throws, treat it as a failed check.
          return {
            name: 'unknown',
            status: 'fail' as HealthCheckStatus,
            message: `checker threw: ${msg}`,
          };
        }
      }),
    );

    return {
      status: aggregateStatus(results),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  // -------------------------------------------------------------------------
  // Worker heartbeat (Worker side)
  // -------------------------------------------------------------------------

  /**
   * Start publishing heartbeat messages to `system.health` on the configured
   * interval. Requires a NATS client to have been provided at construction.
   *
   * @param workerId  Unique identifier for this worker instance.
   * @param getStats  Callback that supplies runtime stats for the heartbeat payload.
   * @param interval  Override the default interval (ms).
   */
  startHeartbeat(
    workerId: string,
    getStats: () => { activeBots: number; cpuUsage: number; memUsage: number },
    interval?: number,
  ): void {
    if (this.nats === undefined) {
      throw new Error(
        'HealthMonitor.startHeartbeat: a NatsClient must be provided at construction',
      );
    }
    if (this.heartbeatTimer !== undefined) return; // already running

    const ms = interval ?? this.heartbeatIntervalMs;
    const nats = this.nats;

    const publish = (status: WorkerHeartbeatPayload['status']): void => {
      const stats = getStats();
      const payload: WorkerHeartbeatPayload = {
        workerId,
        timestamp: Date.now(),
        activeBots: stats.activeBots,
        cpuUsage: stats.cpuUsage,
        memUsage: stats.memUsage,
        status,
      };
      try {
        nats.publish('system.health', payload);
      } catch {
        // Swallow; if NATS is down the worker cannot heartbeat but must not crash.
      }
    };

    // Publish immediately, then on every interval tick.
    publish('running');
    this.heartbeatTimer = setInterval(() => publish('running'), ms);
  }

  /** Stop the heartbeat timer and publish a final `shutting_down` heartbeat. */
  stopHeartbeat(workerId?: string): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (workerId !== undefined && this.nats !== undefined) {
      const mem = sampleMemory();
      const payload: WorkerHeartbeatPayload = {
        workerId,
        timestamp: Date.now(),
        activeBots: 0,
        cpuUsage: 0,
        memUsage: mem.usedRatio,
        status: 'shutting_down',
      };
      try {
        this.nats.publish('system.health', payload);
      } catch {
        // Swallow.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Worker liveness monitoring (Gateway side)
  // -------------------------------------------------------------------------

  /**
   * Subscribe to `system.health` via NATS and track worker liveness.
   * Workers that have not sent a heartbeat within `workerTimeout` ms are
   * marked unhealthy.
   *
   * @param timeout  Override the stale-worker timeout (ms).
   */
  monitorWorkers(timeout?: number): void {
    if (this.nats === undefined) {
      throw new Error(
        'HealthMonitor.monitorWorkers: a NatsClient must be provided at construction',
      );
    }

    const effectiveTimeout = timeout ?? this.workerTimeoutMs;

    // Subscribe to heartbeats.
    this.nats.subscribe('system.health', async (data: unknown) => {
      const payload = this.parseHeartbeat(data);
      if (payload === undefined) return;

      this.workers.set(payload.workerId, {
        lastSeen: new Date(),
        healthy: payload.status !== 'shutting_down',
        payload,
      });
    });

    // Periodically evict / mark stale workers.
    this.workerMonitorTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, record] of this.workers) {
        const age = now - record.lastSeen.getTime();
        if (age > effectiveTimeout) {
          this.workers.set(id, { ...record, healthy: false });
        }
      }
    }, Math.min(effectiveTimeout, 5_000));
  }

  /** Stop the worker-monitor polling timer. */
  stopMonitoring(): void {
    if (this.workerMonitorTimer !== undefined) {
      clearInterval(this.workerMonitorTimer);
      this.workerMonitorTimer = undefined;
    }
  }

  /**
   * Return a snapshot of all known workers and their liveness state.
   * The map key is the worker ID.
   */
  getWorkerStatus(): Map<string, { lastSeen: Date; healthy: boolean }> {
    const out = new Map<string, { lastSeen: Date; healthy: boolean }>();
    for (const [id, record] of this.workers) {
      out.set(id, { lastSeen: record.lastSeen, healthy: record.healthy });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Register all built-in checks based on the options provided. */
  private registerBuiltinChecks(): void {
    if (this.storage !== undefined) {
      this.checkers.set(`storage:${this.storage.name}`, makeStorageCheck(this.storage));
    }

    if (this.nats !== undefined) {
      this.checkers.set('nats', makeNatsCheck(this.nats));
    }

    this.checkers.set('ai_adapters', makeAdapterCheck(this.engine));
    this.checkers.set('memory', makeMemoryCheck());
    this.checkers.set('event_loop', makeEventLoopCheck());
  }

  /** Safely parse an incoming heartbeat payload. */
  private parseHeartbeat(data: unknown): WorkerHeartbeatPayload | undefined {
    if (typeof data !== 'object' || data === null) return undefined;

    const obj = data as Record<string, unknown>;

    if (
      typeof obj['workerId'] !== 'string' ||
      typeof obj['timestamp'] !== 'number' ||
      typeof obj['activeBots'] !== 'number' ||
      typeof obj['cpuUsage'] !== 'number' ||
      typeof obj['memUsage'] !== 'number'
    ) {
      return undefined;
    }

    const status =
      obj['status'] === 'shutting_down' ? 'shutting_down' : 'running';

    return {
      workerId: obj['workerId'],
      timestamp: obj['timestamp'],
      activeBots: obj['activeBots'],
      cpuUsage: obj['cpuUsage'],
      memUsage: obj['memUsage'],
      status,
    };
  }
}

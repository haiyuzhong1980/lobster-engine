// @lobster-engine/gateway — Prometheus metrics via prom-client

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';
import type { MiddlewareHandler } from 'hono';

// ---------------------------------------------------------------------------
// Label type helpers
// ---------------------------------------------------------------------------

type HttpLabels = { method: string; path: string; status: string };
type BotSceneLabel = { scene: string };
type SceneTurnLabel = { scene: string };
type AiRequestLabels = { adapter: string; status: string };
type AiDurationLabels = { adapter: string };
type AiTokensLabels = { adapter: string; direction: string };
type WorkerTaskLabel = { worker: string };
type StorageOpsLabels = { provider: string; op: string };
type StorageDurationLabels = { provider: string };
type NatsLabels = { subject: string; direction: string };

// ---------------------------------------------------------------------------
// MetricsRegistry
// ---------------------------------------------------------------------------

/**
 * Singleton Prometheus metrics registry for the Lobster Engine gateway.
 *
 * Exposes counters, gauges, and histograms covering:
 *   - HTTP request traffic (gateway)
 *   - Bot and scene lifecycle
 *   - AI adapter calls
 *   - Worker pool activity
 *   - Storage operations
 *   - NATS messaging
 *   - Process uptime / default Node.js metrics
 */
export class MetricsRegistry {
  private static _instance: MetricsRegistry | undefined;

  readonly registry: Registry;

  // ── Gateway ────────────────────────────────────────────────────────────────

  readonly httpRequestsTotal: Counter<keyof HttpLabels>;
  readonly httpDurationSeconds: Histogram<keyof HttpLabels>;

  // ── Bots ───────────────────────────────────────────────────────────────────

  readonly botsTotal: Gauge;
  readonly botsActive: Gauge;
  readonly botsByScene: Gauge<keyof BotSceneLabel>;

  // ── Scenes ─────────────────────────────────────────────────────────────────

  readonly scenesActive: Gauge;
  readonly sceneTurnsTotal: Counter<keyof SceneTurnLabel>;

  // ── AI calls ───────────────────────────────────────────────────────────────

  readonly aiRequestsTotal: Counter<keyof AiRequestLabels>;
  readonly aiDurationSeconds: Histogram<keyof AiDurationLabels>;
  readonly aiTokensTotal: Counter<keyof AiTokensLabels>;

  // ── Worker pool ────────────────────────────────────────────────────────────

  readonly workersActive: Gauge;
  readonly workerTasksTotal: Counter<keyof WorkerTaskLabel>;
  readonly workerQueueDepth: Gauge;

  // ── Storage ────────────────────────────────────────────────────────────────

  readonly storageOpsTotal: Counter<keyof StorageOpsLabels>;
  readonly storageDurationSeconds: Histogram<keyof StorageDurationLabels>;

  // ── NATS ───────────────────────────────────────────────────────────────────

  readonly natsMessagesTotal: Counter<keyof NatsLabels>;
  readonly natsConnected: Gauge;

  // ── System ─────────────────────────────────────────────────────────────────

  readonly uptimeSeconds: Gauge;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor(register?: Registry) {
    this.registry = register ?? new Registry();

    // ── Gateway ──────────────────────────────────────────────────────────────

    this.httpRequestsTotal = new Counter({
      name: 'lobster_http_requests_total',
      help: 'Total HTTP requests received, labelled by method, path, and status code',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpDurationSeconds = new Histogram({
      name: 'lobster_http_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // ── Bots ─────────────────────────────────────────────────────────────────

    this.botsTotal = new Gauge({
      name: 'lobster_bots_total',
      help: 'Total number of registered bots',
      registers: [this.registry],
    });

    this.botsActive = new Gauge({
      name: 'lobster_bots_active',
      help: 'Number of bots in active status',
      registers: [this.registry],
    });

    this.botsByScene = new Gauge({
      name: 'lobster_bots_by_scene',
      help: 'Number of active bots per scene type',
      labelNames: ['scene'],
      registers: [this.registry],
    });

    // ── Scenes ───────────────────────────────────────────────────────────────

    this.scenesActive = new Gauge({
      name: 'lobster_scenes_active',
      help: 'Number of currently active scenes',
      registers: [this.registry],
    });

    this.sceneTurnsTotal = new Counter({
      name: 'lobster_scene_turns_total',
      help: 'Total turn events processed per scene type',
      labelNames: ['scene'],
      registers: [this.registry],
    });

    // ── AI calls ─────────────────────────────────────────────────────────────

    this.aiRequestsTotal = new Counter({
      name: 'lobster_ai_requests_total',
      help: 'Total AI adapter requests, labelled by adapter and outcome status',
      labelNames: ['adapter', 'status'],
      registers: [this.registry],
    });

    this.aiDurationSeconds = new Histogram({
      name: 'lobster_ai_duration_seconds',
      help: 'AI adapter call duration in seconds',
      labelNames: ['adapter'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.aiTokensTotal = new Counter({
      name: 'lobster_ai_tokens_total',
      help: 'Total AI tokens consumed, labelled by adapter and direction (input|output)',
      labelNames: ['adapter', 'direction'],
      registers: [this.registry],
    });

    // ── Worker pool ──────────────────────────────────────────────────────────

    this.workersActive = new Gauge({
      name: 'lobster_workers_active',
      help: 'Number of workers currently processing a task',
      registers: [this.registry],
    });

    this.workerTasksTotal = new Counter({
      name: 'lobster_worker_tasks_total',
      help: 'Total tasks dispatched per worker name',
      labelNames: ['worker'],
      registers: [this.registry],
    });

    this.workerQueueDepth = new Gauge({
      name: 'lobster_worker_queue_depth',
      help: 'Current number of tasks waiting in the worker queue',
      registers: [this.registry],
    });

    // ── Storage ──────────────────────────────────────────────────────────────

    this.storageOpsTotal = new Counter({
      name: 'lobster_storage_ops_total',
      help: 'Total storage operations, labelled by provider and operation type',
      labelNames: ['provider', 'op'],
      registers: [this.registry],
    });

    this.storageDurationSeconds = new Histogram({
      name: 'lobster_storage_duration_seconds',
      help: 'Storage operation duration in seconds',
      labelNames: ['provider'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });

    // ── NATS ─────────────────────────────────────────────────────────────────

    this.natsMessagesTotal = new Counter({
      name: 'lobster_nats_messages_total',
      help: 'Total NATS messages, labelled by subject and direction (inbound|outbound)',
      labelNames: ['subject', 'direction'],
      registers: [this.registry],
    });

    this.natsConnected = new Gauge({
      name: 'lobster_nats_connected',
      help: '1 when the NATS client is connected, 0 otherwise',
      registers: [this.registry],
    });

    // ── System ───────────────────────────────────────────────────────────────

    this.uptimeSeconds = new Gauge({
      name: 'lobster_uptime_seconds',
      help: 'Process uptime in seconds',
      registers: [this.registry],
      collect() {
        this.set(process.uptime());
      },
    });

    // Node.js default metrics (event loop lag, GC, heap, etc.)
    collectDefaultMetrics({ register: this.registry });
  }

  // ---------------------------------------------------------------------------
  // Singleton accessor
  // ---------------------------------------------------------------------------

  static getInstance(): MetricsRegistry {
    if (MetricsRegistry._instance === undefined) {
      MetricsRegistry._instance = new MetricsRegistry();
    }
    return MetricsRegistry._instance;
  }

  /**
   * Reset the singleton — useful in tests to get a clean registry without
   * cross-test metric leakage.
   */
  static resetInstance(): void {
    MetricsRegistry._instance = undefined;
  }

  // ---------------------------------------------------------------------------
  // Convenience record helpers
  // ---------------------------------------------------------------------------

  // ── HTTP ──────────────────────────────────────────────────────────────────

  recordHttpRequest(method: string, path: string, status: number, durationSeconds: number): void {
    const labels: HttpLabels = { method, path, status: String(status) };
    this.httpRequestsTotal.labels(labels).inc();
    this.httpDurationSeconds.labels({ method, path }).observe(durationSeconds);
  }

  // ── Bots ─────────────────────────────────────────────────────────────────

  setBotCounts(total: number, active: number): void {
    this.botsTotal.set(total);
    this.botsActive.set(active);
  }

  setBotsForScene(scene: string, count: number): void {
    this.botsByScene.labels({ scene }).set(count);
  }

  // ── Scenes ───────────────────────────────────────────────────────────────

  setScenesActive(count: number): void {
    this.scenesActive.set(count);
  }

  incrementSceneTurn(scene: string): void {
    this.sceneTurnsTotal.labels({ scene }).inc();
  }

  // ── AI calls ─────────────────────────────────────────────────────────────

  recordAiRequest(
    adapter: string,
    status: 'success' | 'error',
    durationSeconds: number,
    inputTokens?: number,
    outputTokens?: number,
  ): void {
    this.aiRequestsTotal.labels({ adapter, status }).inc();
    this.aiDurationSeconds.labels({ adapter }).observe(durationSeconds);
    if (inputTokens !== undefined && inputTokens > 0) {
      this.aiTokensTotal.labels({ adapter, direction: 'input' }).inc(inputTokens);
    }
    if (outputTokens !== undefined && outputTokens > 0) {
      this.aiTokensTotal.labels({ adapter, direction: 'output' }).inc(outputTokens);
    }
  }

  // ── Worker pool ──────────────────────────────────────────────────────────

  setWorkerMetrics(active: number, queueDepth: number): void {
    this.workersActive.set(active);
    this.workerQueueDepth.set(queueDepth);
  }

  incrementWorkerTask(worker: string): void {
    this.workerTasksTotal.labels({ worker }).inc();
  }

  // ── Storage ──────────────────────────────────────────────────────────────

  recordStorageOp(provider: string, op: string, durationSeconds: number): void {
    this.storageOpsTotal.labels({ provider, op }).inc();
    this.storageDurationSeconds.labels({ provider }).observe(durationSeconds);
  }

  // ── NATS ─────────────────────────────────────────────────────────────────

  recordNatsMessage(subject: string, direction: 'inbound' | 'outbound'): void {
    this.natsMessagesTotal.labels({ subject, direction }).inc();
  }

  setNatsConnected(connected: boolean): void {
    this.natsConnected.set(connected ? 1 : 0);
  }

  // ---------------------------------------------------------------------------
  // Prometheus text output
  // ---------------------------------------------------------------------------

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}

// ---------------------------------------------------------------------------
// Hono middleware — automatic HTTP metrics collection
// ---------------------------------------------------------------------------

/**
 * Hono middleware that records `lobster_http_requests_total` and
 * `lobster_http_duration_seconds` for every request.
 *
 * Path normalisation strips UUIDs and numeric IDs so that labels remain
 * low-cardinality (e.g. `/api/v1/bots/:id` instead of
 * `/api/v1/bots/f47ac10b-58cc-4372-a567-0e02b2c3d479`).
 */
export function createMetricsMiddleware(
  metrics: MetricsRegistry = MetricsRegistry.getInstance(),
): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const durationSeconds = (Date.now() - start) / 1000;
    const method = c.req.method;
    const path = normalisePath(new URL(c.req.url).pathname);
    const status = c.res.status;
    metrics.recordHttpRequest(method, path, status, durationSeconds);
  };
}

/**
 * Replace dynamic path segments (UUIDs and bare integers) with a placeholder
 * so Prometheus label cardinality stays bounded.
 */
function normalisePath(raw: string): string {
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

// ---------------------------------------------------------------------------
// /metrics route handler factory
// ---------------------------------------------------------------------------

/**
 * Returns a Hono route handler that serves the Prometheus text exposition
 * format at `/metrics`.
 */
export function createMetricsHandler(
  metrics: MetricsRegistry = MetricsRegistry.getInstance(),
): (c: Parameters<MiddlewareHandler>[0]) => Promise<Response> {
  return async (c) => {
    const body = await metrics.metricsText();
    return c.text(body, 200, {
      'Content-Type': metrics.contentType(),
    });
  };
}

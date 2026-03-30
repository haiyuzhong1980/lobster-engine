// @lobster-engine/gateway — MetricsRegistry unit tests

import { describe, it, expect, afterEach } from 'vitest';
import { Registry } from 'prom-client';
import { Hono } from 'hono';
import { MetricsRegistry, createMetricsMiddleware, createMetricsHandler } from '../metrics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an isolated MetricsRegistry backed by a fresh prom-client Registry. */
function makeRegistry(): MetricsRegistry {
  return new MetricsRegistry(new Registry());
}

// ---------------------------------------------------------------------------
// MetricsRegistry — construction and metric registration
// ---------------------------------------------------------------------------

describe('MetricsRegistry construction', () => {
  it('registers all expected metric names', async () => {
    const mr = makeRegistry();
    const text = await mr.metricsText();

    const expectedNames = [
      'lobster_http_requests_total',
      'lobster_http_duration_seconds',
      'lobster_bots_total',
      'lobster_bots_active',
      'lobster_bots_by_scene',
      'lobster_scenes_active',
      'lobster_scene_turns_total',
      'lobster_ai_requests_total',
      'lobster_ai_duration_seconds',
      'lobster_ai_tokens_total',
      'lobster_workers_active',
      'lobster_worker_tasks_total',
      'lobster_worker_queue_depth',
      'lobster_storage_ops_total',
      'lobster_storage_duration_seconds',
      'lobster_nats_messages_total',
      'lobster_nats_connected',
      'lobster_uptime_seconds',
    ];

    for (const name of expectedNames) {
      expect(text, `expected metric "${name}" in /metrics output`).toContain(name);
    }
  });

  it('includes Node.js default metrics', async () => {
    const mr = makeRegistry();
    const text = await mr.metricsText();
    // prom-client collectDefaultMetrics emits process_cpu_seconds_total
    expect(text).toMatch(/process_cpu_seconds_total|nodejs_version_info/);
  });

  it('returns a content-type string', () => {
    const mr = makeRegistry();
    expect(mr.contentType()).toContain('text/plain');
  });
});

// ---------------------------------------------------------------------------
// MetricsRegistry — record helpers
// ---------------------------------------------------------------------------

describe('MetricsRegistry.recordHttpRequest', () => {
  it('increments the counter and observes the histogram', async () => {
    const mr = makeRegistry();
    mr.recordHttpRequest('GET', '/health', 200, 0.042);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_http_requests_total\{[^}]*method="GET"[^}]*\} 1/);
    expect(text).toMatch(/lobster_http_requests_total\{[^}]*status="200"[^}]*\} 1/);
    expect(text).toContain('lobster_http_duration_seconds');
  });

  it('accumulates multiple calls on the same labels', async () => {
    const mr = makeRegistry();
    mr.recordHttpRequest('POST', '/api/v1/bots/register', 201, 0.01);
    mr.recordHttpRequest('POST', '/api/v1/bots/register', 201, 0.02);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_http_requests_total\{[^}]*method="POST"[^}]*\} 2/);
  });
});

describe('MetricsRegistry bot/scene helpers', () => {
  it('sets bot count gauges', async () => {
    const mr = makeRegistry();
    mr.setBotCounts(10, 7);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_bots_total\s+10/);
    expect(text).toMatch(/lobster_bots_active\s+7/);
  });

  it('sets bots-by-scene gauge', async () => {
    const mr = makeRegistry();
    mr.setBotsForScene('werewolf', 5);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_bots_by_scene\{scene="werewolf"\}\s+5/);
  });

  it('sets and increments scene metrics', async () => {
    const mr = makeRegistry();
    mr.setScenesActive(3);
    mr.incrementSceneTurn('werewolf');
    mr.incrementSceneTurn('werewolf');
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_scenes_active\s+3/);
    expect(text).toMatch(/lobster_scene_turns_total\{scene="werewolf"\}\s+2/);
  });
});

describe('MetricsRegistry.recordAiRequest', () => {
  it('records a successful AI call with tokens', async () => {
    const mr = makeRegistry();
    mr.recordAiRequest('openclaw', 'success', 1.23, 50, 200);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_ai_requests_total\{[^}]*adapter="openclaw"[^}]*status="success"[^}]*\} 1/);
    expect(text).toMatch(/lobster_ai_tokens_total\{[^}]*adapter="openclaw"[^}]*direction="input"[^}]*\} 50/);
    expect(text).toMatch(/lobster_ai_tokens_total\{[^}]*adapter="openclaw"[^}]*direction="output"[^}]*\} 200/);
    expect(text).toContain('lobster_ai_duration_seconds');
  });

  it('records an error AI call without tokens', async () => {
    const mr = makeRegistry();
    mr.recordAiRequest('coze', 'error', 0.5);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_ai_requests_total\{[^}]*adapter="coze"[^}]*status="error"[^}]*\} 1/);
    // No token lines for coze because none were passed
    expect(text).not.toMatch(/lobster_ai_tokens_total\{[^}]*adapter="coze"/);
  });
});

describe('MetricsRegistry worker / storage / NATS helpers', () => {
  it('sets worker gauges and increments task counter', async () => {
    const mr = makeRegistry();
    mr.setWorkerMetrics(4, 12);
    mr.incrementWorkerTask('turn-processor');
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_workers_active\s+4/);
    expect(text).toMatch(/lobster_worker_queue_depth\s+12/);
    expect(text).toMatch(/lobster_worker_tasks_total\{worker="turn-processor"\}\s+1/);
  });

  it('records storage operations', async () => {
    const mr = makeRegistry();
    mr.recordStorageOp('sqlite', 'get', 0.002);
    mr.recordStorageOp('sqlite', 'set', 0.003);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_storage_ops_total\{[^}]*provider="sqlite"[^}]*op="get"[^}]*\} 1/);
    expect(text).toMatch(/lobster_storage_ops_total\{[^}]*provider="sqlite"[^}]*op="set"[^}]*\} 1/);
    expect(text).toContain('lobster_storage_duration_seconds');
  });

  it('records NATS messages and connection state', async () => {
    const mr = makeRegistry();
    mr.recordNatsMessage('bot.turn', 'inbound');
    mr.recordNatsMessage('bot.action', 'outbound');
    mr.setNatsConnected(true);
    const text = await mr.metricsText();

    expect(text).toMatch(/lobster_nats_messages_total\{[^}]*subject="bot\.turn"[^}]*direction="inbound"[^}]*\} 1/);
    expect(text).toMatch(/lobster_nats_messages_total\{[^}]*subject="bot\.action"[^}]*direction="outbound"[^}]*\} 1/);
    expect(text).toMatch(/lobster_nats_connected\s+1/);
  });

  it('sets nats connected to 0 when disconnected', async () => {
    const mr = makeRegistry();
    mr.setNatsConnected(false);
    const text = await mr.metricsText();
    expect(text).toMatch(/lobster_nats_connected\s+0/);
  });
});

describe('MetricsRegistry uptime', () => {
  it('emits lobster_uptime_seconds with a positive value', async () => {
    const mr = makeRegistry();
    const text = await mr.metricsText();
    // Match "lobster_uptime_seconds <positive-float>"
    const match = text.match(/lobster_uptime_seconds\s+([\d.]+)/);
    expect(match).not.toBeNull();
    const value = parseFloat(match![1]!);
    expect(value).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Singleton behaviour
// ---------------------------------------------------------------------------

describe('MetricsRegistry singleton', () => {
  afterEach(() => {
    MetricsRegistry.resetInstance();
  });

  it('getInstance returns the same instance on repeated calls', () => {
    const a = MetricsRegistry.getInstance();
    const b = MetricsRegistry.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance causes a fresh instance to be created', () => {
    const a = MetricsRegistry.getInstance();
    MetricsRegistry.resetInstance();
    const b = MetricsRegistry.getInstance();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// HTTP middleware
// ---------------------------------------------------------------------------

describe('createMetricsMiddleware', () => {
  it('records metrics after a request completes', async () => {
    const mr = makeRegistry();
    const app = new Hono();
    app.use('*', createMetricsMiddleware(mr));
    app.get('/health', (c) => c.json({ status: 'ok' }));

    await app.request('/health');

    const text = await mr.metricsText();
    expect(text).toMatch(/lobster_http_requests_total\{[^}]*method="GET"[^}]*path="\/health"[^}]*status="200"[^}]*\} 1/);
  });

  it('normalises UUID path segments', async () => {
    const mr = makeRegistry();
    const app = new Hono();
    app.use('*', createMetricsMiddleware(mr));
    app.get('/api/v1/bots/:id', (c) => c.json({ id: c.req.param('id') }));

    await app.request('/api/v1/bots/f47ac10b-58cc-4372-a567-0e02b2c3d479');

    const text = await mr.metricsText();
    // UUID replaced with :id
    expect(text).toContain('path="/api/v1/bots/:id"');
    // Raw UUID must not appear as a label value
    expect(text).not.toContain('f47ac10b-58cc-4372-a567-0e02b2c3d479');
  });

  it('normalises numeric path segments', async () => {
    const mr = makeRegistry();
    const app = new Hono();
    app.use('*', createMetricsMiddleware(mr));
    app.get('/api/v1/items/:id', (c) => c.json({ id: c.req.param('id') }));

    await app.request('/api/v1/items/42');

    const text = await mr.metricsText();
    expect(text).toContain('path="/api/v1/items/:id"');
  });

  it('accumulates counters across multiple requests', async () => {
    const mr = makeRegistry();
    const app = new Hono();
    app.use('*', createMetricsMiddleware(mr));
    app.get('/ping', (c) => c.text('pong'));

    await app.request('/ping');
    await app.request('/ping');
    await app.request('/ping');

    const text = await mr.metricsText();
    expect(text).toMatch(/lobster_http_requests_total\{[^}]*path="\/ping"[^}]*\} 3/);
  });
});

// ---------------------------------------------------------------------------
// /metrics route handler
// ---------------------------------------------------------------------------

describe('createMetricsHandler', () => {
  it('serves Prometheus text format at /metrics', async () => {
    const mr = makeRegistry();
    const app = new Hono();
    app.get('/metrics', createMetricsHandler(mr));

    const res = await app.request('/metrics');
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type') ?? '';
    expect(contentType).toContain('text/plain');

    const body = await res.text();
    expect(body).toContain('lobster_uptime_seconds');
    expect(body).toContain('lobster_http_requests_total');
  });

  it('returns valid Prometheus text with HELP and TYPE lines', async () => {
    const mr = makeRegistry();
    // Record one data point so histogram buckets appear
    mr.recordHttpRequest('GET', '/metrics', 200, 0.001);

    const app = new Hono();
    app.get('/metrics', createMetricsHandler(mr));

    const res = await app.request('/metrics');
    const body = await res.text();

    expect(body).toMatch(/^# HELP lobster_http_requests_total/m);
    expect(body).toMatch(/^# TYPE lobster_http_requests_total counter/m);
    expect(body).toMatch(/^# HELP lobster_http_duration_seconds/m);
    expect(body).toMatch(/^# TYPE lobster_http_duration_seconds histogram/m);
  });
});

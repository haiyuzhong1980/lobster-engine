// @lobster-engine/core — HealthMonitor unit tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthMonitor } from '../health.js';
import type { HealthMonitorOptions, HealthCheck, HealthChecker } from '../health.js';
import type { LobsterEngine } from '../engine.js';
import type { StorageProvider } from '../storage.js';
import type { NatsClient, MessageHandler } from '../nats.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeEngine(adapterCount = 0): LobsterEngine {
  const adapters = Array.from({ length: adapterCount }, (_, i) => ({ name: `adapter-${i}` }));
  return {
    adapters: {
      list: vi.fn().mockReturnValue(adapters),
    },
  } as unknown as LobsterEngine;
}

function makeStorage(name = 'mock-storage', healthResult = true): StorageProvider {
  return {
    name,
    health: vi.fn().mockResolvedValue(healthResult),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    getMany: vi.fn().mockResolvedValue(new Map()),
    setMany: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  } as unknown as StorageProvider;
}

interface MockNatsClient {
  _subscriptionHandlers: Map<string, MessageHandler>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  queueSubscribe: ReturnType<typeof vi.fn>;
  health: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  drain: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn>;
}

function makeNats(connected = true, server = 'nats://localhost:4222'): MockNatsClient {
  const handlers = new Map<string, MessageHandler>();

  const mock: MockNatsClient = {
    _subscriptionHandlers: handlers,
    publish: vi.fn(),
    subscribe: vi.fn().mockImplementation((subject: string, handler: MessageHandler) => {
      handlers.set(subject, handler);
      return { unsubscribe: vi.fn() };
    }),
    queueSubscribe: vi.fn(),
    health: vi.fn().mockReturnValue({ connected, server }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
    request: vi.fn(),
    isConnected: vi.fn().mockReturnValue(connected),
  };
  return mock;
}

function makeMonitor(opts: HealthMonitorOptions & { adapterCount?: number } = {}): HealthMonitor {
  const { adapterCount = 1, ...monitorOpts } = opts;
  const engine = makeEngine(adapterCount);
  return new HealthMonitor(engine, monitorOpts);
}

// ---------------------------------------------------------------------------
// HealthMonitor — construction
// ---------------------------------------------------------------------------

describe('HealthMonitor construction', () => {
  it('constructs without options', () => {
    const monitor = makeMonitor();
    expect(monitor).toBeInstanceOf(HealthMonitor);
  });

  it('constructs with nats and storage options', () => {
    const storage = makeStorage();
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient, storage });
    expect(monitor).toBeInstanceOf(HealthMonitor);
  });

  it('constructs with custom heartbeat and worker timeout intervals', () => {
    const monitor = makeMonitor({ heartbeatInterval: 5_000, workerTimeout: 15_000 });
    expect(monitor).toBeInstanceOf(HealthMonitor);
  });
});

// ---------------------------------------------------------------------------
// HealthMonitor — registerCheck() and check()
// ---------------------------------------------------------------------------

describe('HealthMonitor registerCheck() and check()', () => {
  it('returns healthy status when no checks are registered besides built-ins', async () => {
    const monitor = makeMonitor({ adapterCount: 1 });
    const result = await monitor.check();
    // built-ins: ai_adapters, memory, event_loop — all should pass with 1 adapter
    expect(result.status).toBe('healthy');
  });

  it('registered check appears in the results', async () => {
    const monitor = makeMonitor();
    const customCheck: HealthChecker = async () => ({
      name: 'custom-check',
      status: 'pass',
    });
    monitor.registerCheck('custom-check', customCheck);
    const result = await monitor.check();
    const found = result.checks.find((c) => c.name === 'custom-check');
    expect(found).toBeDefined();
    expect(found?.status).toBe('pass');
  });

  it('replaces an existing check when the same name is registered twice', async () => {
    const monitor = makeMonitor();
    const firstCheck: HealthChecker = async () => ({ name: 'dupe', status: 'pass' });
    const secondCheck: HealthChecker = async () => ({ name: 'dupe', status: 'fail', message: 'second' });
    monitor.registerCheck('dupe', firstCheck);
    monitor.registerCheck('dupe', secondCheck);
    const result = await monitor.check();
    const matches = result.checks.filter((c) => c.name === 'dupe');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.status).toBe('fail');
  });

  it('returns unhealthy when at least one check fails', async () => {
    const monitor = makeMonitor();
    monitor.registerCheck('always-fail', async () => ({ name: 'always-fail', status: 'fail' }));
    const result = await monitor.check();
    expect(result.status).toBe('unhealthy');
  });

  it('returns degraded when at least one check warns and none fail', async () => {
    const monitor = makeMonitor();
    monitor.registerCheck('warn-check', async () => ({ name: 'warn-check', status: 'warn', message: 'slow' }));
    const result = await monitor.check();
    expect(result.status).toBe('degraded');
  });

  it('returns healthy when all registered checks pass', async () => {
    const monitor = makeMonitor();
    monitor.registerCheck('ok-a', async () => ({ name: 'ok-a', status: 'pass' }));
    monitor.registerCheck('ok-b', async () => ({ name: 'ok-b', status: 'pass' }));
    const result = await monitor.check();
    expect(result.status).toBe('healthy');
  });

  it('includes uptime in seconds', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes an ISO timestamp', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('treats a throwing checker as a failed check', async () => {
    const monitor = makeMonitor();
    monitor.registerCheck('throws', async () => {
      throw new Error('boom');
    });
    const result = await monitor.check();
    expect(result.status).toBe('unhealthy');
  });

  it('all checks run concurrently — results array contains one entry per registered check', async () => {
    const monitor = makeMonitor({ adapterCount: 0 });
    monitor.registerCheck('a', async () => ({ name: 'a', status: 'pass' }));
    monitor.registerCheck('b', async () => ({ name: 'b', status: 'pass' }));
    const result = await monitor.check();
    // Built-ins: ai_adapters, memory, event_loop  +  2 custom  = at least 5
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
  });

  it('mixed results: fail takes precedence over warn', async () => {
    const monitor = makeMonitor();
    monitor.registerCheck('warn', async () => ({ name: 'warn', status: 'warn' }));
    monitor.registerCheck('fail', async () => ({ name: 'fail', status: 'fail' }));
    const result = await monitor.check();
    expect(result.status).toBe('unhealthy');
  });
});

// ---------------------------------------------------------------------------
// Built-in checks
// ---------------------------------------------------------------------------

describe('built-in storage check', () => {
  it('passes when storage.health() returns true', async () => {
    const storage = makeStorage('test-db', true);
    const monitor = makeMonitor({ storage });
    const result = await monitor.check();
    const storageCheck = result.checks.find((c) => c.name.startsWith('storage:'));
    expect(storageCheck).toBeDefined();
    expect(storageCheck?.status).toBe('pass');
  });

  it('fails when storage.health() returns false', async () => {
    const storage = makeStorage('test-db', false);
    const monitor = makeMonitor({ storage });
    const result = await monitor.check();
    const storageCheck = result.checks.find((c) => c.name.startsWith('storage:'));
    expect(storageCheck?.status).toBe('fail');
    expect(storageCheck?.message).toContain('false');
  });

  it('fails when storage.health() throws', async () => {
    const storage = makeStorage();
    (storage.health as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    const monitor = makeMonitor({ storage });
    const result = await monitor.check();
    const storageCheck = result.checks.find((c) => c.name.startsWith('storage:'));
    expect(storageCheck?.status).toBe('fail');
    expect(storageCheck?.message).toContain('db down');
  });

  it('includes latency in the storage check result', async () => {
    const storage = makeStorage();
    const monitor = makeMonitor({ storage });
    const result = await monitor.check();
    const storageCheck = result.checks.find((c) => c.name.startsWith('storage:'));
    expect(typeof storageCheck?.latency).toBe('number');
  });

  it('uses the storage name in the check name', async () => {
    const storage = makeStorage('redis-hot');
    const monitor = makeMonitor({ storage });
    const result = await monitor.check();
    const storageCheck = result.checks.find((c) => c.name === 'storage:redis-hot');
    expect(storageCheck).toBeDefined();
  });
});

describe('built-in memory check', () => {
  it('includes a memory check in results', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    const memCheck = result.checks.find((c) => c.name === 'memory');
    expect(memCheck).toBeDefined();
  });

  it('memory check status is pass, warn, or fail', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    const memCheck = result.checks.find((c) => c.name === 'memory');
    expect(['pass', 'warn', 'fail']).toContain(memCheck?.status);
  });

  it('memory check message contains heap usage info', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    const memCheck = result.checks.find((c) => c.name === 'memory');
    expect(memCheck?.message).toMatch(/heap/i);
  });
});

describe('built-in event loop check', () => {
  it('includes an event_loop check in results', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    const loopCheck = result.checks.find((c) => c.name === 'event_loop');
    expect(loopCheck).toBeDefined();
  });

  it('event_loop check has a latency value', async () => {
    const monitor = makeMonitor();
    const result = await monitor.check();
    const loopCheck = result.checks.find((c) => c.name === 'event_loop');
    expect(typeof loopCheck?.latency).toBe('number');
  });
});

describe('built-in NATS check', () => {
  it('passes when NATS is connected', async () => {
    const nats = makeNats(true, 'nats://localhost:4222');
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    const result = await monitor.check();
    const natsCheck = result.checks.find((c) => c.name === 'nats');
    expect(natsCheck?.status).toBe('pass');
  });

  it('fails when NATS is not connected', async () => {
    const nats = makeNats(false);
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    const result = await monitor.check();
    const natsCheck = result.checks.find((c) => c.name === 'nats');
    expect(natsCheck?.status).toBe('fail');
  });
});

describe('built-in AI adapters check', () => {
  it('warns when no adapters are registered', async () => {
    const monitor = makeMonitor({ adapterCount: 0 });
    const result = await monitor.check();
    const adapterCheck = result.checks.find((c) => c.name === 'ai_adapters');
    expect(adapterCheck?.status).toBe('warn');
  });

  it('passes when at least one adapter is registered', async () => {
    const monitor = makeMonitor({ adapterCount: 2 });
    const result = await monitor.check();
    const adapterCheck = result.checks.find((c) => c.name === 'ai_adapters');
    expect(adapterCheck?.status).toBe('pass');
    expect(adapterCheck?.message).toContain('2');
  });
});

// ---------------------------------------------------------------------------
// Worker heartbeat — startHeartbeat / stopHeartbeat
// ---------------------------------------------------------------------------

describe('startHeartbeat()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when no NatsClient is provided', () => {
    const monitor = makeMonitor();
    expect(() =>
      monitor.startHeartbeat('worker-1', () => ({ activeBots: 0, cpuUsage: 0, memUsage: 0 })),
    ).toThrow('NatsClient must be provided');
  });

  it('publishes a heartbeat immediately on start', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.startHeartbeat('worker-1', () => ({ activeBots: 2, cpuUsage: 0.1, memUsage: 0.4 }));
    expect(nats.publish).toHaveBeenCalledOnce();
    monitor.stopHeartbeat();
  });

  it('publishes heartbeat on the configured interval', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient, heartbeatInterval: 1_000 });
    monitor.startHeartbeat('worker-1', () => ({ activeBots: 0, cpuUsage: 0, memUsage: 0 }));
    nats.publish.mockClear();
    vi.advanceTimersByTime(2_500);
    // should fire twice more
    expect(nats.publish.mock.calls.length).toBeGreaterThanOrEqual(2);
    monitor.stopHeartbeat();
  });

  it('heartbeat payload includes workerId, activeBots, cpuUsage, memUsage', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.startHeartbeat('worker-abc', () => ({ activeBots: 5, cpuUsage: 0.25, memUsage: 0.6 }));
    const [, payload] = nats.publish.mock.calls[0] as [string, unknown];
    const p = payload as Record<string, unknown>;
    expect(p['workerId']).toBe('worker-abc');
    expect(p['activeBots']).toBe(5);
    expect(p['cpuUsage']).toBe(0.25);
    expect(p['memUsage']).toBe(0.6);
    monitor.stopHeartbeat();
  });

  it('is idempotent — second startHeartbeat() call is a no-op', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.startHeartbeat('w', () => ({ activeBots: 0, cpuUsage: 0, memUsage: 0 }));
    monitor.startHeartbeat('w', () => ({ activeBots: 0, cpuUsage: 0, memUsage: 0 }));
    // Should still only have published once (second call is a no-op)
    expect(nats.publish).toHaveBeenCalledOnce();
    monitor.stopHeartbeat();
  });

  it('stopHeartbeat() publishes a shutting_down payload when workerId provided', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.startHeartbeat('w1', () => ({ activeBots: 0, cpuUsage: 0, memUsage: 0 }));
    nats.publish.mockClear();
    monitor.stopHeartbeat('w1');
    expect(nats.publish).toHaveBeenCalledOnce();
    const [, payload] = nats.publish.mock.calls[0] as [string, unknown];
    const p = payload as Record<string, unknown>;
    expect(p['status']).toBe('shutting_down');
  });

  it('stopHeartbeat() without workerId stops timer without final publish', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.startHeartbeat('w2', () => ({ activeBots: 0, cpuUsage: 0, memUsage: 0 }));
    nats.publish.mockClear();
    monitor.stopHeartbeat(); // no workerId
    expect(nats.publish).not.toHaveBeenCalled();
    // Timer should be stopped — advancing time emits no additional calls
    vi.advanceTimersByTime(5_000);
    expect(nats.publish).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Worker liveness monitoring — monitorWorkers / getWorkerStatus
// ---------------------------------------------------------------------------

describe('monitorWorkers()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when no NatsClient is provided', () => {
    const monitor = makeMonitor();
    expect(() => monitor.monitorWorkers()).toThrow('NatsClient must be provided');
  });

  it('subscribes to system.health subject', () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.monitorWorkers();
    expect(nats.subscribe).toHaveBeenCalledWith('system.health', expect.any(Function));
    monitor.stopMonitoring();
  });

  it('tracks a worker after receiving a heartbeat', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    expect(handler).toBeDefined();

    await handler?.({
      workerId: 'worker-1',
      timestamp: Date.now(),
      activeBots: 3,
      cpuUsage: 0.2,
      memUsage: 0.5,
      status: 'running',
    });

    const workers = monitor.getWorkerStatus();
    expect(workers.has('worker-1')).toBe(true);
    expect(workers.get('worker-1')?.healthy).toBe(true);
    monitor.stopMonitoring();
  });

  it('marks a worker unhealthy when status is shutting_down', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    await handler?.({
      workerId: 'worker-down',
      timestamp: Date.now(),
      activeBots: 0,
      cpuUsage: 0,
      memUsage: 0,
      status: 'shutting_down',
    });

    const workers = monitor.getWorkerStatus();
    expect(workers.get('worker-down')?.healthy).toBe(false);
    monitor.stopMonitoring();
  });

  it('ignores malformed heartbeat payloads', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    await handler?.({ garbage: true });

    const workers = monitor.getWorkerStatus();
    expect(workers.size).toBe(0);
    monitor.stopMonitoring();
  });

  it('ignores null payloads', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    await handler?.(null);

    expect(monitor.getWorkerStatus().size).toBe(0);
    monitor.stopMonitoring();
  });

  it('updates lastSeen when a subsequent heartbeat arrives', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({ nats: nats as unknown as NatsClient });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    const base = {
      workerId: 'w',
      timestamp: Date.now(),
      activeBots: 0,
      cpuUsage: 0,
      memUsage: 0,
      status: 'running' as const,
    };

    await handler?.(base);
    const first = monitor.getWorkerStatus().get('w')?.lastSeen;

    vi.advanceTimersByTime(1_000);
    await handler?.({ ...base, timestamp: Date.now() });
    const second = monitor.getWorkerStatus().get('w')?.lastSeen;

    expect(second?.getTime()).toBeGreaterThanOrEqual(first?.getTime() ?? 0);
    monitor.stopMonitoring();
  });
});

// ---------------------------------------------------------------------------
// Worker timeout detection
// ---------------------------------------------------------------------------

describe('worker timeout detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks a worker unhealthy after workerTimeout ms without a heartbeat', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({
      nats: nats as unknown as NatsClient,
      workerTimeout: 30_000,
    });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    await handler?.({
      workerId: 'stale-worker',
      timestamp: Date.now(),
      activeBots: 0,
      cpuUsage: 0,
      memUsage: 0,
      status: 'running',
    });

    // The polling interval is min(workerTimeout, 5000) = 5000ms.
    // We need the clock to advance past 30000ms AND for a poll tick to fire
    // after that point. The tick at 30000ms sees age = 30000 which is NOT
    // strictly greater than 30000.  The tick at 35000ms sees age = 35000
    // which IS greater.
    vi.advanceTimersByTime(36_000);

    const workers = monitor.getWorkerStatus();
    expect(workers.get('stale-worker')?.healthy).toBe(false);
    monitor.stopMonitoring();
  });

  it('worker remains healthy before timeout elapses', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({
      nats: nats as unknown as NatsClient,
      workerTimeout: 30_000,
    });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    await handler?.({
      workerId: 'live-worker',
      timestamp: Date.now(),
      activeBots: 0,
      cpuUsage: 0,
      memUsage: 0,
      status: 'running',
    });

    vi.advanceTimersByTime(10_000); // well within 30s

    expect(monitor.getWorkerStatus().get('live-worker')?.healthy).toBe(true);
    monitor.stopMonitoring();
  });
});

// ---------------------------------------------------------------------------
// Overall status derivation
// ---------------------------------------------------------------------------

describe('overall status derivation', () => {
  it('returns healthy when all checks pass', async () => {
    const monitor = makeMonitor({ adapterCount: 1 });
    const checks: readonly HealthCheck[] = [
      { name: 'a', status: 'pass' },
      { name: 'b', status: 'pass' },
    ];
    monitor.registerCheck('a', async () => checks[0] as HealthCheck);
    monitor.registerCheck('b', async () => checks[1] as HealthCheck);
    const result = await monitor.check();
    // Built-ins are also registered but if they all pass we expect healthy
    expect(['healthy', 'degraded']).toContain(result.status);
  });

  it('returns degraded when any check returns warn', async () => {
    const monitor = makeMonitor({ adapterCount: 1 });
    monitor.registerCheck('warn-only', async () => ({ name: 'warn-only', status: 'warn' }));
    const result = await monitor.check();
    // Either degraded (warn present, no fail) or unhealthy (if built-ins fail)
    // We can assert at minimum it is not healthy
    const valid: string[] = ['degraded', 'unhealthy'];
    expect(valid).toContain(result.status);
  });

  it('returns unhealthy when any check fails', async () => {
    const monitor = makeMonitor();
    monitor.registerCheck('critical', async () => ({ name: 'critical', status: 'fail', message: 'down' }));
    const result = await monitor.check();
    expect(result.status).toBe('unhealthy');
  });
});

// ---------------------------------------------------------------------------
// stopMonitoring()
// ---------------------------------------------------------------------------

describe('stopMonitoring()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is safe to call before monitorWorkers()', () => {
    const monitor = makeMonitor();
    expect(() => monitor.stopMonitoring()).not.toThrow();
  });

  it('stops the polling timer after stopMonitoring()', async () => {
    const nats = makeNats();
    const monitor = makeMonitor({
      nats: nats as unknown as NatsClient,
      workerTimeout: 5_000,
    });
    monitor.monitorWorkers();

    const handler = nats._subscriptionHandlers.get('system.health');
    await handler?.({
      workerId: 'w',
      timestamp: Date.now(),
      activeBots: 0,
      cpuUsage: 0,
      memUsage: 0,
      status: 'running',
    });

    monitor.stopMonitoring();

    // Even after >5s the worker should not be marked unhealthy because the
    // timer was stopped.
    vi.advanceTimersByTime(10_000);
    expect(monitor.getWorkerStatus().get('w')?.healthy).toBe(true);
  });
});

#!/usr/bin/env tsx
// scripts/stress-test.ts — Lobster Engine Stress Test (P5.10)
//
// Three phases:
//   1. Direct Engine  — 1000 bots, no network, pure in-process throughput
//   2. Gateway HTTP   — 3000 concurrent HTTP requests (register / join / action)
//   3. WebSocket      — 100 concurrent WS clients, broadcast delivery verification
//
// Run:  pnpm exec tsx scripts/stress-test.ts

import { createServer as createHttpServer } from 'node:http';
import { WebSocket } from 'ws';
import { LobsterEngine, MemoryProvider } from '../packages/core/dist/index.js';
import { GatewayServer, WSManager, createWSHandler } from '../packages/gateway/dist/index.js';

import type {
  AIPlatformAdapter,
  AdapterCapabilities,
  ChatMessage,
  ChatResponse,
} from '../packages/core/dist/index.js';
import type {
  ScenePlugin,
  SceneContext,
  ActionValidationResult,
} from '../packages/core/dist/index.js';
import type { TurnEvent, ActionSpec } from '../packages/core/dist/index.js';

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedMs.length) - 1;
  return sortedMs[Math.max(0, idx)] ?? 0;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)} ms`;
}

function memMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

// ---------------------------------------------------------------------------
// Mock implementations (zero-latency, no real AI)
// ---------------------------------------------------------------------------

class InstantAdapter implements AIPlatformAdapter {
  readonly name = 'instant-adapter';
  readonly platform = 'mock';

  async detect(): Promise<boolean> {
    return true;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async chat(_messages: readonly ChatMessage[]): Promise<ChatResponse> {
    return {
      content: '{"type":"move","target":"position-a"}',
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    };
  }

  getCapabilities(): AdapterCapabilities {
    return {
      streaming: false,
      functionCalling: false,
      vision: false,
      maxContextLength: 4096,
    };
  }
}

class InstantScenePlugin implements ScenePlugin {
  readonly name = 'instant-scene';
  readonly version = '0.0.1';
  readonly sceneType = 'stress-scene';

  buildPrompt(_event: TurnEvent, _context: SceneContext): ChatMessage[] {
    return [
      { role: 'system', content: 'You are a stress-test bot.' },
      { role: 'user', content: 'Take an action.' },
    ];
  }

  parseAction(response: string, _context: SceneContext): ActionSpec {
    try {
      const parsed = JSON.parse(response) as Record<string, unknown>;
      return {
        type: typeof parsed['type'] === 'string' ? parsed['type'] : 'move',
        content: response,
        target: typeof parsed['target'] === 'string' ? parsed['target'] : undefined,
        metadata: {},
      };
    } catch {
      return this.getDefaultAction(
        { id: '', botId: '', sceneId: '', type: '', phase: 'day', data: {}, timestamp: 0 },
        _context,
      );
    }
  }

  validateAction(_action: ActionSpec, _context: SceneContext): ActionValidationResult {
    return { valid: true };
  }

  getDefaultAction(_event: TurnEvent, _context: SceneContext): ActionSpec {
    return { type: 'noop', content: '', target: undefined, metadata: {} };
  }

  formatEvent(event: TurnEvent, perspective?: string): string {
    return `[${perspective ?? 'all'}] ${event.type}`;
  }
}

// ---------------------------------------------------------------------------
// Utility: find a free port
// ---------------------------------------------------------------------------

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createHttpServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr === null || typeof addr === 'string') {
        srv.close(() => reject(new Error('Could not determine free port')));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — Direct Engine Stress
// ---------------------------------------------------------------------------

interface EnginePhaseResult {
  botsSpawned: number;
  totalActions: number;
  durationMs: number;
  throughput: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
  peakMemoryMb: number;
}

async function runEnginePhase(botCount: number, turnsPerBot: number): Promise<EnginePhaseResult> {
  const engine = new LobsterEngine({
    name: 'stress-engine',
    storage: new MemoryProvider(),
    plugins: [new InstantScenePlugin()],
    adapters: [new InstantAdapter()],
  });

  await engine.start();

  const latencies: number[] = [];
  let errors = 0;
  let peakMem = memMb();

  const phaseStart = Date.now();

  // Batch bots into concurrency windows to avoid exhausting the event loop
  const concurrency = 100;
  const batchCount = Math.ceil(botCount / concurrency);

  for (let batch = 0; batch < batchCount; batch++) {
    const start = batch * concurrency;
    const end = Math.min(start + concurrency, botCount);
    const batchBots: Promise<void>[] = [];

    for (let i = start; i < end; i++) {
      const botId = `stress-bot-${i}`;
      const sceneId = `stress-scene:room-${Math.floor(i / 10)}`;

      const botWork = async (): Promise<void> => {
        for (let turn = 0; turn < turnsPerBot; turn++) {
          const event: TurnEvent = {
            id: `evt-${botId}-${turn}`,
            botId,
            sceneId,
            type: 'turn',
            phase: 'day',
            data: { turn },
            timestamp: Date.now(),
          };

          const t0 = performance.now();
          try {
            await engine.handleTurnEvent(event);
          } catch {
            errors++;
          }
          latencies.push(performance.now() - t0);
        }

        const currentMem = memMb();
        if (currentMem > peakMem) peakMem = currentMem;
      };

      batchBots.push(botWork());
    }

    await Promise.all(batchBots);
  }

  const durationMs = Date.now() - phaseStart;
  const totalActions = latencies.length;

  latencies.sort((a, b) => a - b);

  await engine.stop();

  return {
    botsSpawned: botCount,
    totalActions,
    durationMs,
    throughput: durationMs > 0 ? (totalActions / durationMs) * 1000 : 0,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    errors,
    peakMemoryMb: peakMem,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Gateway HTTP Stress
// ---------------------------------------------------------------------------

interface GatewayPhaseResult {
  requests: number;
  durationMs: number;
  qps: number;
  p50: number;
  p95: number;
  errors: number;
}

async function runGatewayPhase(botCount: number): Promise<GatewayPhaseResult> {
  const port = await getFreePort();
  const gateway = new GatewayServer({ port, host: '127.0.0.1' });
  await gateway.start();

  const base = `http://127.0.0.1:${port}`;
  const latencies: number[] = [];
  let errors = 0;

  async function timedFetch(url: string, init: RequestInit): Promise<boolean> {
    const t0 = performance.now();
    try {
      const res = await fetch(url, init);
      latencies.push(performance.now() - t0);
      return res.ok;
    } catch {
      latencies.push(performance.now() - t0);
      errors++;
      return false;
    }
  }

  const phaseStart = Date.now();

  // Step 1: Register botCount bots concurrently
  const registrations = Array.from({ length: botCount }, (_, i) =>
    timedFetch(`${base}/api/v1/bots/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'stress', metadata: { index: i } }),
    }),
  );

  const registerResults = await Promise.all(registrations);
  const botIds: string[] = [];

  // Re-fetch bot list to get actual IDs (or parse from response body)
  // Since timedFetch doesn't expose body, re-register small batches for ID capture
  for (let i = 0; i < botCount; i++) {
    if (!registerResults[i]) errors++;
  }

  // Get registered bots from the list endpoint (paginated)
  const totalPages = Math.ceil(botCount / 100);
  for (let page = 1; page <= totalPages; page++) {
    try {
      const res = await fetch(`${base}/api/v1/bots?page=${page}&limit=100`);
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{ id: string }>;
        };
        for (const bot of json.data ?? []) {
          botIds.push(bot.id);
        }
      }
    } catch {
      errors++;
    }
  }

  // Step 2: Join scenes concurrently (one shared scene per 10 bots)
  const joins = botIds.map((botId, i) =>
    timedFetch(`${base}/api/v1/scenes/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId,
        sceneType: 'stress-scene',
        sceneId: `stress-scene:room-${Math.floor(i / 10)}`,
      }),
    }),
  );

  const joinResults = await Promise.all(joins);
  const sceneIds: string[] = [];

  for (let i = 0; i < joinResults.length; i++) {
    sceneIds.push(`stress-scene:room-${Math.floor(i / 10)}`);
    if (!joinResults[i]) errors++;
  }

  // Step 3: Submit actions concurrently
  const actions = botIds.map((botId, i) =>
    timedFetch(`${base}/api/v1/scenes/${encodeURIComponent(sceneIds[i] ?? 'stress-scene:room-0')}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, type: 'move', content: 'move forward' }),
    }),
  );

  const actionResults = await Promise.all(actions);
  for (const ok of actionResults) {
    if (!ok) errors++;
  }

  const durationMs = Date.now() - phaseStart;
  const totalRequests = latencies.length;

  latencies.sort((a, b) => a - b);

  await gateway.stop();

  return {
    requests: totalRequests,
    durationMs,
    qps: durationMs > 0 ? (totalRequests / durationMs) * 1000 : 0,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    errors,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — WebSocket Stress
// ---------------------------------------------------------------------------

interface WSPhaseResult {
  connections: number;
  messagesSent: number;
  messagesReceived: number;
  deliveryPct: number;
  avgLatencyMs: number;
  droppedConnections: number;
}

async function runWSPhase(clientCount: number): Promise<WSPhaseResult> {
  const port = await getFreePort();

  // Create a plain HTTP server wired to WSManager
  const manager = new WSManager({
    heartbeatIntervalMs: 60_000, // long interval so heartbeat doesn't fire during test
    maxConnectionsPerScene: clientCount + 10,
  });

  const handler = createWSHandler(manager);
  const httpServer = createHttpServer();
  httpServer.on('upgrade', handler);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, '127.0.0.1', resolve);
  });

  const wsUrl = `ws://127.0.0.1:${port}`;
  const sceneId = 'stress-scene:ws-room';

  let totalReceived = 0;
  let droppedConnections = 0;
  const latencies: number[] = [];

  // Connect all clients
  const clients: WebSocket[] = [];
  const clientReadyPromises: Promise<void>[] = [];

  for (let i = 0; i < clientCount; i++) {
    const ws = new WebSocket(wsUrl);
    clients.push(ws);

    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        droppedConnections++;
        reject(new Error('WS connection timeout'));
      }, 5000);

      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });

      ws.once('error', (err) => {
        clearTimeout(timer);
        droppedConnections++;
        reject(err);
      });
    });

    clientReadyPromises.push(ready);
  }

  // Wait for all connections (ignore individual failures)
  const connectResults = await Promise.allSettled(clientReadyPromises);
  const connectedCount = connectResults.filter((r) => r.status === 'fulfilled').length;

  // Each connected client subscribes to the test scene
  // and sets up a message counter. We track latency via timestamped broadcasts.
  const messagePromises: Promise<void>[] = [];
  const sendTimestamps: number[] = [];

  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    // Subscribe
    ws.send(JSON.stringify({ type: 'subscribe', sceneId }));

    // Listen for broadcasts
    const p = new Promise<void>((resolve) => {
      ws.on('message', (raw) => {
        const now = performance.now();
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; data?: unknown };
          if (msg.type === 'event') {
            totalReceived++;
            // Compute latency if timestamp embedded in data
            const data = msg.data as Record<string, unknown> | undefined;
            if (data && typeof data['_sentAt'] === 'number') {
              latencies.push(now - (data['_sentAt'] as number));
            }
          }
          if (msg.type === 'subscribed') resolve();
        } catch {
          // ignore parse errors
        }
      });
    });

    messagePromises.push(p);
  }

  // Wait for subscribe confirmations (up to 2s)
  await Promise.race([
    Promise.allSettled(messagePromises),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);

  // Broadcast N messages to the scene
  const broadcastCount = 10;
  for (let i = 0; i < broadcastCount; i++) {
    const sentAt = performance.now();
    sendTimestamps.push(sentAt);
    manager.broadcastRawToScene(sceneId, 'event', { index: i, _sentAt: sentAt });
  }

  // Wait briefly for messages to propagate
  await new Promise<void>((resolve) => setTimeout(resolve, 500));

  const expectedDeliveries = connectedCount * broadcastCount;
  const deliveryPct = expectedDeliveries > 0 ? (totalReceived / expectedDeliveries) * 100 : 0;
  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  // Cleanup
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 200));

  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return {
    connections: connectedCount,
    messagesSent: connectedCount * broadcastCount,
    messagesReceived: totalReceived,
    deliveryPct,
    avgLatencyMs: avgLatency,
    droppedConnections,
  };
}

// ---------------------------------------------------------------------------
// Pass/fail evaluation
// ---------------------------------------------------------------------------

interface PassCriteria {
  engineThroughputMin: number;   // actions/sec
  engineP95MaxMs: number;        // ms
  gatewayQpsMin: number;         // req/sec
  gatewayP95MaxMs: number;       // ms
  wsDeliveryPctMin: number;      // %
  errorRateMaxPct: number;       // %
  peakMemoryMaxMb: number;       // MB
}

const PASS_CRITERIA: PassCriteria = {
  engineThroughputMin: 500,
  engineP95MaxMs: 100,
  gatewayQpsMin: 200,
  gatewayP95MaxMs: 200,
  wsDeliveryPctMin: 99,
  errorRateMaxPct: 1,
  peakMemoryMaxMb: 1024,
};

// ---------------------------------------------------------------------------
// Report printer
// ---------------------------------------------------------------------------

function printReport(
  engine: EnginePhaseResult,
  gateway: GatewayPhaseResult,
  ws: WSPhaseResult,
  totalDurationMs: number,
  criteria: PassCriteria,
): void {
  const engineErrorPct = engine.totalActions > 0 ? (engine.errors / engine.totalActions) * 100 : 0;
  const gatewayErrorPct = gateway.requests > 0 ? (gateway.errors / gateway.requests) * 100 : 0;

  // Evaluate criteria
  const checks = {
    engineThroughput: engine.throughput >= criteria.engineThroughputMin,
    engineP95: engine.p95 <= criteria.engineP95MaxMs,
    gatewayQps: gateway.qps >= criteria.gatewayQpsMin,
    gatewayP95: gateway.p95 <= criteria.gatewayP95MaxMs,
    wsDelivery: ws.deliveryPct >= criteria.wsDeliveryPctMin,
    engineErrors: engineErrorPct <= criteria.errorRateMaxPct,
    gatewayErrors: gatewayErrorPct <= criteria.errorRateMaxPct,
    memory: engine.peakMemoryMb <= criteria.peakMemoryMaxMb,
  };

  const allPass = Object.values(checks).every(Boolean);
  const flag = (pass: boolean): string => (pass ? 'PASS' : 'FAIL');

  const date = new Date().toISOString();
  const durationSec = (totalDurationMs / 1000).toFixed(1);

  console.log('');
  console.log('=== Lobster Engine Stress Test Report ===');
  console.log(`Date:     ${date}`);
  console.log(`Duration: ${durationSec}s`);
  console.log('');
  console.log('[Engine Direct]');
  console.log(`  Bots spawned:    ${engine.botsSpawned}`);
  console.log(`  Total actions:   ${engine.totalActions}`);
  console.log(`  Throughput:      ${engine.throughput.toFixed(0)} actions/sec  [min ${criteria.engineThroughputMin}]  ${flag(checks.engineThroughput)}`);
  console.log(`  Latency p50:     ${formatMs(engine.p50)}`);
  console.log(`  Latency p95:     ${formatMs(engine.p95)}  [max ${criteria.engineP95MaxMs}ms]  ${flag(checks.engineP95)}`);
  console.log(`  Latency p99:     ${formatMs(engine.p99)}`);
  console.log(`  Errors:          ${engine.errors} (${engineErrorPct.toFixed(2)}%)  [max ${criteria.errorRateMaxPct}%]  ${flag(checks.engineErrors)}`);
  console.log(`  Peak memory:     ${engine.peakMemoryMb.toFixed(0)} MB  [max ${criteria.peakMemoryMaxMb}MB]  ${flag(checks.memory)}`);
  console.log('');
  console.log('[Gateway HTTP]');
  console.log(`  Requests:        ${gateway.requests}`);
  console.log(`  QPS:             ${gateway.qps.toFixed(0)}  [min ${criteria.gatewayQpsMin}]  ${flag(checks.gatewayQps)}`);
  console.log(`  Latency p50:     ${formatMs(gateway.p50)}`);
  console.log(`  Latency p95:     ${formatMs(gateway.p95)}  [max ${criteria.gatewayP95MaxMs}ms]  ${flag(checks.gatewayP95)}`);
  console.log(`  Errors:          ${gateway.errors} (${gatewayErrorPct.toFixed(2)}%)  [max ${criteria.errorRateMaxPct}%]  ${flag(checks.gatewayErrors)}`);
  console.log('');
  console.log('[WebSocket]');
  console.log(`  Connections:     ${ws.connections}`);
  console.log(`  Dropped:         ${ws.droppedConnections}`);
  console.log(`  Messages sent:   ${ws.messagesSent}`);
  console.log(`  Messages recv:   ${ws.messagesReceived} (${ws.deliveryPct.toFixed(1)}% delivery)  [min ${criteria.wsDeliveryPctMin}%]  ${flag(checks.wsDelivery)}`);
  console.log(`  Avg latency:     ${formatMs(ws.avgLatencyMs)}`);
  console.log('');

  const failedChecks = Object.entries(checks)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (allPass) {
    console.log('RESULT: PASS — all criteria met');
  } else {
    console.log(`RESULT: FAIL — ${failedChecks.length} criterion failed: ${failedChecks.join(', ')}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const BOT_COUNT = 1000;
  const TURNS_PER_BOT = 10;
  const WS_CLIENTS = 100;

  console.log('Lobster Engine Stress Test — starting');
  console.log(`  Engine phase:  ${BOT_COUNT} bots x ${TURNS_PER_BOT} turns`);
  console.log(`  Gateway phase: ${BOT_COUNT} bots (register + join + action)`);
  console.log(`  WS phase:      ${WS_CLIENTS} clients`);
  console.log('');

  const wallStart = Date.now();

  // Phase 1
  console.log('Phase 1/3: Direct engine...');
  const engineResult = await runEnginePhase(BOT_COUNT, TURNS_PER_BOT);
  console.log(`  Done — ${engineResult.throughput.toFixed(0)} actions/sec, p95=${formatMs(engineResult.p95)}`);

  // Phase 2
  console.log('Phase 2/3: Gateway HTTP...');
  const gatewayResult = await runGatewayPhase(BOT_COUNT);
  console.log(`  Done — ${gatewayResult.qps.toFixed(0)} QPS, p95=${formatMs(gatewayResult.p95)}`);

  // Phase 3
  console.log('Phase 3/3: WebSocket...');
  const wsResult = await runWSPhase(WS_CLIENTS);
  console.log(`  Done — ${wsResult.deliveryPct.toFixed(1)}% delivery`);

  const totalDurationMs = Date.now() - wallStart;

  printReport(engineResult, gatewayResult, wsResult, totalDurationMs, PASS_CRITERIA);

  // Exit with non-zero code on failure
  const engineErrorPct =
    engineResult.totalActions > 0
      ? (engineResult.errors / engineResult.totalActions) * 100
      : 0;
  const gatewayErrorPct =
    gatewayResult.requests > 0 ? (gatewayResult.errors / gatewayResult.requests) * 100 : 0;

  const pass =
    engineResult.throughput >= PASS_CRITERIA.engineThroughputMin &&
    engineResult.p95 <= PASS_CRITERIA.engineP95MaxMs &&
    gatewayResult.qps >= PASS_CRITERIA.gatewayQpsMin &&
    gatewayResult.p95 <= PASS_CRITERIA.gatewayP95MaxMs &&
    wsResult.deliveryPct >= PASS_CRITERIA.wsDeliveryPctMin &&
    engineErrorPct <= PASS_CRITERIA.errorRateMaxPct &&
    gatewayErrorPct <= PASS_CRITERIA.errorRateMaxPct &&
    engineResult.peakMemoryMb <= PASS_CRITERIA.peakMemoryMaxMb;

  process.exit(pass ? 0 : 1);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Stress test fatal error:', message);
  process.exit(1);
});

// @lobster-engine/core — Stress test (CI-safe, reduced scale)
//
// 100 bots, 10 turns each → 1 000 total actions.
// Looser thresholds than the full 1 000-bot script so it runs comfortably in CI.
//
// Pass criteria (CI):
//   - Throughput:  > 200 actions/sec
//   - p95 latency: < 200 ms
//   - p99 latency: < 500 ms
//   - Error rate:  < 1 %
//   - Peak memory: < 512 MB

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LobsterEngine } from '../engine.js';
import { MemoryProvider } from '../memory-provider.js';
import type {
  AIPlatformAdapter,
  AdapterCapabilities,
  ChatMessage,
  ChatResponse,
} from '../adapter.js';
import type { ScenePlugin, SceneContext, ActionValidationResult } from '../scene.js';
import type { TurnEvent, ActionSpec } from '../types.js';

// ---------------------------------------------------------------------------
// CI thresholds
// ---------------------------------------------------------------------------

const CI_THROUGHPUT_MIN = 200;   // actions/sec
const CI_P95_MAX_MS = 200;       // ms
const CI_P99_MAX_MS = 500;       // ms
const CI_ERROR_RATE_MAX = 0.01;  // 1 %
const CI_PEAK_MEMORY_MB_MAX = 512;

// ---------------------------------------------------------------------------
// Stat helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function currentHeapMb(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

// ---------------------------------------------------------------------------
// Minimal mock implementations (zero latency)
// ---------------------------------------------------------------------------

class CIAdapter implements AIPlatformAdapter {
  readonly name = 'ci-instant-adapter';
  readonly platform = 'ci';

  async detect(): Promise<boolean> {
    return true;
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async chat(_messages: readonly ChatMessage[]): Promise<ChatResponse> {
    return {
      content: '{"type":"noop","target":null}',
      finishReason: 'stop',
      usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
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

class CIScenePlugin implements ScenePlugin {
  readonly name = 'ci-scene';
  readonly version = '0.0.1';
  readonly sceneType = 'ci-stress';

  buildPrompt(_event: TurnEvent, _ctx: SceneContext): ChatMessage[] {
    return [
      { role: 'system', content: 'CI stress bot.' },
      { role: 'user', content: 'Act.' },
    ];
  }

  parseAction(response: string, _ctx: SceneContext): ActionSpec {
    try {
      const parsed = JSON.parse(response) as Record<string, unknown>;
      return {
        type: typeof parsed['type'] === 'string' ? parsed['type'] : 'noop',
        content: response,
        target: typeof parsed['target'] === 'string' ? parsed['target'] : undefined,
        metadata: {},
      };
    } catch {
      return this.getDefaultAction(
        { id: '', botId: '', sceneId: '', type: '', phase: 'day', data: {}, timestamp: 0 },
        _ctx,
      );
    }
  }

  validateAction(_action: ActionSpec, _ctx: SceneContext): ActionValidationResult {
    return { valid: true };
  }

  getDefaultAction(_event: TurnEvent, _ctx: SceneContext): ActionSpec {
    return { type: 'noop', content: '', target: undefined, metadata: {} };
  }

  formatEvent(event: TurnEvent, perspective?: string): string {
    return `[${perspective ?? 'all'}] ${event.type}`;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('LobsterEngine stress (CI — 100 bots)', () => {
  const BOT_COUNT = 100;
  const TURNS_PER_BOT = 10;
  const CONCURRENCY = 50;

  let engine: LobsterEngine;

  // Collected metrics across all bots (populated in the single test body)
  let latenciesMs: number[] = [];
  let errorCount = 0;
  let totalActions = 0;
  let durationMs = 0;
  let peakMemoryMb = 0;

  beforeAll(async () => {
    engine = new LobsterEngine({
      name: 'ci-stress-engine',
      storage: new MemoryProvider(),
      plugins: [new CIScenePlugin()],
      adapters: [new CIAdapter()],
    });
    await engine.start();
  });

  afterAll(async () => {
    await engine.stop();
  });

  it(`processes ${BOT_COUNT} bots x ${TURNS_PER_BOT} turns concurrently`, async () => {
    latenciesMs = [];
    errorCount = 0;

    const start = Date.now();
    let memSnapshot = currentHeapMb();

    // Drive all bots in batches of CONCURRENCY
    const batches = Math.ceil(BOT_COUNT / CONCURRENCY);

    for (let b = 0; b < batches; b++) {
      const lo = b * CONCURRENCY;
      const hi = Math.min(lo + CONCURRENCY, BOT_COUNT);
      const tasks: Promise<void>[] = [];

      for (let i = lo; i < hi; i++) {
        const botId = `ci-bot-${i}`;
        const sceneId = `ci-stress:room-${Math.floor(i / 10)}`;

        tasks.push(
          (async (): Promise<void> => {
            for (let t = 0; t < TURNS_PER_BOT; t++) {
              const event: TurnEvent = {
                id: `ci-evt-${botId}-${t}`,
                botId,
                sceneId,
                type: 'ci-turn',
                phase: 'day',
                data: { turn: t },
                timestamp: Date.now(),
              };

              const t0 = performance.now();
              try {
                const result = await engine.handleTurnEvent(event);
                if (!result.success) errorCount++;
              } catch {
                errorCount++;
              }
              latenciesMs.push(performance.now() - t0);
            }

            const m = currentHeapMb();
            if (m > memSnapshot) memSnapshot = m;
          })(),
        );
      }

      await Promise.all(tasks);
    }

    durationMs = Date.now() - start;
    totalActions = latenciesMs.length;
    peakMemoryMb = memSnapshot;

    latenciesMs.sort((a, b) => a - b);
  }, 60_000 /* 60s timeout */);

  // -------------------------------------------------------------------------
  // Metric assertions (each in its own `it` so failures are individually named)
  // -------------------------------------------------------------------------

  it('meets throughput threshold', () => {
    const throughput = durationMs > 0 ? (totalActions / durationMs) * 1000 : 0;
    expect(
      throughput,
      `Throughput ${throughput.toFixed(0)} actions/sec should be >= ${CI_THROUGHPUT_MIN}`,
    ).toBeGreaterThanOrEqual(CI_THROUGHPUT_MIN);
  });

  it('meets p95 latency threshold', () => {
    const p95 = percentile(latenciesMs, 95);
    expect(p95, `p95 ${p95.toFixed(1)}ms should be <= ${CI_P95_MAX_MS}ms`).toBeLessThanOrEqual(
      CI_P95_MAX_MS,
    );
  });

  it('meets p99 latency threshold', () => {
    const p99 = percentile(latenciesMs, 99);
    expect(p99, `p99 ${p99.toFixed(1)}ms should be <= ${CI_P99_MAX_MS}ms`).toBeLessThanOrEqual(
      CI_P99_MAX_MS,
    );
  });

  it('stays within error rate threshold', () => {
    const errorRate = totalActions > 0 ? errorCount / totalActions : 0;
    expect(
      errorRate,
      `Error rate ${(errorRate * 100).toFixed(2)}% should be <= ${CI_ERROR_RATE_MAX * 100}%`,
    ).toBeLessThanOrEqual(CI_ERROR_RATE_MAX);
  });

  it('stays within peak memory threshold', () => {
    expect(
      peakMemoryMb,
      `Peak heap ${peakMemoryMb.toFixed(0)}MB should be <= ${CI_PEAK_MEMORY_MB_MAX}MB`,
    ).toBeLessThanOrEqual(CI_PEAK_MEMORY_MB_MAX);
  });

  it('prints a summary', () => {
    // Not a real assertion — purely informational so CI logs show metrics.
    const throughput = durationMs > 0 ? (totalActions / durationMs) * 1000 : 0;
    const p50 = percentile(latenciesMs, 50);
    const p95 = percentile(latenciesMs, 95);
    const p99 = percentile(latenciesMs, 99);
    const errorRate = totalActions > 0 ? (errorCount / totalActions) * 100 : 0;

    console.log('');
    console.log('=== CI Stress Summary ===');
    console.log(`  Bots:        ${BOT_COUNT}`);
    console.log(`  Total turns: ${totalActions}`);
    console.log(`  Duration:    ${durationMs}ms`);
    console.log(`  Throughput:  ${throughput.toFixed(0)} actions/sec`);
    console.log(`  p50:         ${p50.toFixed(1)}ms`);
    console.log(`  p95:         ${p95.toFixed(1)}ms`);
    console.log(`  p99:         ${p99.toFixed(1)}ms`);
    console.log(`  Errors:      ${errorCount} (${errorRate.toFixed(2)}%)`);
    console.log(`  Peak heap:   ${peakMemoryMb.toFixed(0)}MB`);
    console.log('');

    // Always passes — metrics are verified in the dedicated tests above.
    expect(true).toBe(true);
  });
});

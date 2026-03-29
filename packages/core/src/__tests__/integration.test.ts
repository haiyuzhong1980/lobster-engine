// @lobster-engine/core — Phase 1.18 Integration Tests
//
// End-to-end integration of the full turn-processing pipeline.
// These tests compose real subsystems (LobsterEngine, MemoryProvider,
// StateManager) together with lightweight mock boundaries (adapter, plugin)
// to verify observable behaviour across the entire call chain.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LobsterEngine } from '../engine.js';
import { MemoryProvider } from '../memory-provider.js';
import { StateManager } from '../state.js';
import type { BotState } from '../types.js';
import {
  MockAIPlatformAdapter,
  MockScenePlugin,
  MockStorageProvider,
  makeTurnEvent,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEngine(overrides?: {
  plugin?: MockScenePlugin;
  adapter?: MockAIPlatformAdapter;
  storage?: MemoryProvider | MockStorageProvider;
}): LobsterEngine {
  const engine = new LobsterEngine({ name: 'integration-engine' });
  if (overrides?.plugin !== undefined) engine.use(overrides.plugin);
  if (overrides?.adapter !== undefined) engine.registerAdapter(overrides.adapter);
  if (overrides?.storage !== undefined) engine.useStorage(overrides.storage);
  return engine;
}

function makeBotState(botId: string): BotState {
  return {
    sessionId: `session-${botId}`,
    status: 'playing',
    sceneId: 'mock-scene:room-1',
    credentials: { id: botId, token: 'tok', platform: 'mock', metadata: {} },
    config: {},
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — Full turn lifecycle
// ---------------------------------------------------------------------------

describe('integration: full turn lifecycle', () => {
  let engine: LobsterEngine;
  let plugin: MockScenePlugin;
  let adapter: MockAIPlatformAdapter;

  beforeEach(() => {
    plugin = new MockScenePlugin();
    adapter = new MockAIPlatformAdapter();
    engine = buildEngine({ plugin, adapter });
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('returns a successful ActionResult after start → handleTurnEvent', async () => {
    await engine.start();

    const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
    const result = await engine.handleTurnEvent(event);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.action.type).toBe('vote');
    expect(result.action.target).toBe('player1');
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('invokes the full pipeline: buildPrompt → chat → parseAction → validateAction', async () => {
    await engine.start();

    const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
    await engine.handleTurnEvent(event);

    expect(plugin.buildPromptCallCount).toBe(1);
    expect(adapter.chatCallCount).toBe(1);
    expect(plugin.parseActionCallCount).toBe(1);
    expect(plugin.validateActionCallCount).toBe(1);
  });

  it('passes the turn event messages to the adapter', async () => {
    await engine.start();

    const event = makeTurnEvent({ sceneId: 'mock-scene:room-1', phase: 'vote' });
    await engine.handleTurnEvent(event);

    const msgs = adapter.lastMessages;
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('vote_phase');
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Engine start / stop lifecycle with event emissions
// ---------------------------------------------------------------------------

describe('integration: engine start/stop lifecycle', () => {
  let engine: LobsterEngine;

  beforeEach(() => {
    engine = buildEngine();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('emits engine:ready when start() completes', async () => {
    const readyFn = vi.fn();
    engine.on('engine:ready', readyFn);

    await engine.start();

    expect(readyFn).toHaveBeenCalledOnce();
  });

  it('emits engine:stopping when stop() begins', async () => {
    const stoppingFn = vi.fn();
    await engine.start();
    engine.on('engine:stopping', stoppingFn);

    await engine.stop();

    expect(stoppingFn).toHaveBeenCalledOnce();
  });

  it('running flag is true between start() and stop()', async () => {
    expect(engine.running).toBe(false);
    await engine.start();
    expect(engine.running).toBe(true);
    await engine.stop();
    expect(engine.running).toBe(false);
  });

  it('start() is idempotent — second call does not re-emit engine:ready', async () => {
    const readyFn = vi.fn();
    engine.on('engine:ready', readyFn);

    await engine.start();
    await engine.start();

    expect(readyFn).toHaveBeenCalledOnce();
  });

  it('stop() is idempotent when engine was never started', async () => {
    await expect(engine.stop()).resolves.toBeUndefined();
    expect(engine.running).toBe(false);
  });

  it('connects and disconnects the adapter during the lifecycle', async () => {
    const adapter = new MockAIPlatformAdapter();
    engine.registerAdapter(adapter);

    await engine.start();
    expect(adapter.connectCallCount).toBe(1);

    await engine.stop();
    expect(adapter.disconnectCallCount).toBe(1);
  });

  it('calls initialize() on every registered plugin during start()', async () => {
    const p1 = new MockScenePlugin({ name: 'plugin-a', sceneType: 'scene-a' });
    const p2 = new MockScenePlugin({ name: 'plugin-b', sceneType: 'scene-b' });
    engine.use(p1).use(p2);

    await engine.start();

    expect(p1.initializeCallCount).toBe(1);
    expect(p2.initializeCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Multiple sequential turns
// ---------------------------------------------------------------------------

describe('integration: multiple sequential turns', () => {
  let engine: LobsterEngine;
  let plugin: MockScenePlugin;
  let adapter: MockAIPlatformAdapter;

  beforeEach(async () => {
    plugin = new MockScenePlugin();
    adapter = new MockAIPlatformAdapter();
    engine = buildEngine({ plugin, adapter });
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('processes three turns in sequence and all succeed', async () => {
    const events = [
      makeTurnEvent({ id: 'e1', sceneId: 'mock-scene:room-1' }),
      makeTurnEvent({ id: 'e2', sceneId: 'mock-scene:room-1' }),
      makeTurnEvent({ id: 'e3', sceneId: 'mock-scene:room-1' }),
    ];

    const results = [];
    for (const event of events) {
      results.push(await engine.handleTurnEvent(event));
    }

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });

  it('accumulates chat call counts across sequential turns', async () => {
    const turnCount = 4;
    for (let i = 0; i < turnCount; i++) {
      await engine.handleTurnEvent(
        makeTurnEvent({ id: `e${i}`, sceneId: 'mock-scene:room-1' }),
      );
    }

    expect(adapter.chatCallCount).toBe(turnCount);
    expect(plugin.buildPromptCallCount).toBe(turnCount);
    expect(plugin.parseActionCallCount).toBe(turnCount);
  });

  it('each turn emits scene:turn and scene:action independently', async () => {
    const turnFn = vi.fn();
    const actionFn = vi.fn();
    engine.on('scene:turn', turnFn);
    engine.on('scene:action', actionFn);

    for (let i = 0; i < 3; i++) {
      await engine.handleTurnEvent(
        makeTurnEvent({ id: `seq-${i}`, sceneId: 'mock-scene:room-1' }),
      );
    }

    expect(turnFn).toHaveBeenCalledTimes(3);
    expect(actionFn).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Error handling: adapter failure → fallback action
// ---------------------------------------------------------------------------

describe('integration: adapter failure fallback', () => {
  let engine: LobsterEngine;
  let plugin: MockScenePlugin;

  beforeEach(async () => {
    plugin = new MockScenePlugin();
    engine = buildEngine({ plugin });
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('returns a failed ActionResult when adapter.chat() throws', async () => {
    const failingAdapter = new MockAIPlatformAdapter({
      chatError: new Error('upstream timeout'),
    });
    engine.registerAdapter(failingAdapter);

    const event = makeTurnEvent({ sceneId: 'mock-scene:room-1' });
    const result = await engine.handleTurnEvent(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain('upstream timeout');
    expect(result.action.type).toBe('noop');
  });

  it('emits engine:error when adapter.chat() throws', async () => {
    const failingAdapter = new MockAIPlatformAdapter({
      chatError: new Error('network failure'),
    });
    engine.registerAdapter(failingAdapter);

    const errorFn = vi.fn();
    engine.on('engine:error', errorFn);

    await engine.handleTurnEvent(makeTurnEvent({ sceneId: 'mock-scene:room-1' }));

    expect(errorFn).toHaveBeenCalledOnce();
    const [emittedError] = errorFn.mock.calls[0] as [Error];
    expect(emittedError.message).toContain('network failure');
  });

  it('returns failed ActionResult when no adapters are registered', async () => {
    // engine has no adapters registered
    const errorFn = vi.fn();
    engine.on('engine:error', errorFn);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(errorFn).toHaveBeenCalledOnce();
  });

  it('returns failed ActionResult when all adapters report unavailable', async () => {
    const unavailable = new MockAIPlatformAdapter({ unavailable: true });
    engine.registerAdapter(unavailable);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No AI platform adapters');
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Error handling: plugin validation failure → rejection
// ---------------------------------------------------------------------------

describe('integration: plugin validation failure', () => {
  let engine: LobsterEngine;
  let adapter: MockAIPlatformAdapter;

  beforeEach(async () => {
    adapter = new MockAIPlatformAdapter();
    engine = buildEngine({ adapter });
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('returns success:false with validation reason when validateAction rejects', async () => {
    const plugin = new MockScenePlugin({ invalidReason: 'target is already eliminated' });
    engine.use(plugin);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('target is already eliminated');
    expect(result.action.type).toBe('noop');
  });

  it('uses getDefaultAction as the fallback when validation fails', async () => {
    const plugin = new MockScenePlugin({ invalidReason: 'illegal action' });
    engine.use(plugin);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.action.content).toBe('default action');
  });

  it('returns failed result with parseAction error message when parseAction throws', async () => {
    const plugin = new MockScenePlugin({ parseError: new Error('malformed JSON') });
    engine.use(plugin);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    // After a parseAction error, validateAction still runs on the default action.
    // If default action is valid (as MockScenePlugin produces), error is the
    // parseAction message but success stays false because parseError is set.
    expect(result.error).toContain('malformed JSON');
    expect(result.action.type).toBe('noop');
  });

  it('emits engine:error and returns failed result when no matching plugin exists', async () => {
    const errorFn = vi.fn();
    engine.on('engine:error', errorFn);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'unregistered-scene:room-99' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No ScenePlugin found');
    expect(errorFn).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Plugin resolution by scene type
// ---------------------------------------------------------------------------

describe('integration: plugin resolution by scene type', () => {
  let engine: LobsterEngine;
  let adapter: MockAIPlatformAdapter;

  beforeEach(async () => {
    adapter = new MockAIPlatformAdapter();
    engine = buildEngine({ adapter });
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('exact sceneType match resolves the correct plugin', async () => {
    const exact = new MockScenePlugin({ name: 'exact-plugin', sceneType: 'exact-scene' });
    engine.use(exact);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'exact-scene' }),
    );

    expect(result.success).toBe(true);
    expect(exact.buildPromptCallCount).toBe(1);
  });

  it('prefix match resolves a plugin whose sceneType is a prefix of the sceneId', async () => {
    const prefix = new MockScenePlugin({ name: 'prefix-plugin', sceneType: 'werewolf' });
    engine.use(prefix);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'werewolf:room-42' }),
    );

    expect(result.success).toBe(true);
    expect(prefix.buildPromptCallCount).toBe(1);
  });

  it('longer prefix wins over shorter prefix', async () => {
    const short = new MockScenePlugin({ name: 'short', sceneType: 'game' });
    const long = new MockScenePlugin({ name: 'long', sceneType: 'game:werewolf' });
    engine.use(short).use(long);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'game:werewolf:room-7' }),
    );

    expect(result.success).toBe(true);
    expect(long.buildPromptCallCount).toBe(1);
    expect(short.buildPromptCallCount).toBe(0);
  });

  it('exact match takes priority over prefix match', async () => {
    const prefix = new MockScenePlugin({
      name: 'prefix-plugin',
      sceneType: 'quiz',
    });
    const exact = new MockScenePlugin({
      name: 'exact-plugin',
      sceneType: 'quiz:room-1',
    });
    engine.use(prefix).use(exact);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'quiz:room-1' }),
    );

    expect(result.success).toBe(true);
    expect(exact.buildPromptCallCount).toBe(1);
    expect(prefix.buildPromptCallCount).toBe(0);
  });

  it('returns failed result when sceneId does not match any registered plugin', async () => {
    engine.use(new MockScenePlugin({ name: 'p', sceneType: 'chess' }));

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'checkers:room-1' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No ScenePlugin found');
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Adapter selection (preferred vs auto-detect)
// ---------------------------------------------------------------------------

describe('integration: adapter selection', () => {
  let engine: LobsterEngine;
  let plugin: MockScenePlugin;

  beforeEach(async () => {
    plugin = new MockScenePlugin();
    engine = buildEngine({ plugin });
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('auto-selects first available adapter when multiple are registered', async () => {
    const a = new MockAIPlatformAdapter({ name: 'adapter-a', platform: 'platform-a' });
    const b = new MockAIPlatformAdapter({ name: 'adapter-b', platform: 'platform-b' });
    engine.registerAdapter(a).registerAdapter(b);

    await engine.handleTurnEvent(makeTurnEvent({ sceneId: 'mock-scene:room-1' }));

    // Only one of the adapters should have been called.
    const totalCalls = a.chatCallCount + b.chatCallCount;
    expect(totalCalls).toBe(1);
  });

  it('skips unavailable adapters and uses the first available one', async () => {
    const unavailable = new MockAIPlatformAdapter({
      name: 'dead-adapter',
      platform: 'dead',
      unavailable: true,
    });
    const available = new MockAIPlatformAdapter({
      name: 'live-adapter',
      platform: 'live',
    });
    engine.registerAdapter(unavailable).registerAdapter(available);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.success).toBe(true);
    expect(unavailable.chatCallCount).toBe(0);
    expect(available.chatCallCount).toBe(1);
  });

  it('returns failed result when every registered adapter is unavailable', async () => {
    const d1 = new MockAIPlatformAdapter({ name: 'd1', unavailable: true });
    const d2 = new MockAIPlatformAdapter({ name: 'd2', unavailable: true });
    engine.registerAdapter(d1).registerAdapter(d2);

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No AI platform adapters');
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — Event emission verification
// ---------------------------------------------------------------------------

describe('integration: event emission order and payload', () => {
  let engine: LobsterEngine;
  let plugin: MockScenePlugin;
  let adapter: MockAIPlatformAdapter;

  beforeEach(async () => {
    plugin = new MockScenePlugin();
    adapter = new MockAIPlatformAdapter();
    engine = buildEngine({ plugin, adapter });
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('emits engine:ready on start', async () => {
    const fn = vi.fn();
    engine.on('engine:ready', fn);
    await engine.start();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits engine:stopping on stop', async () => {
    await engine.start();
    const fn = vi.fn();
    engine.on('engine:stopping', fn);
    await engine.stop();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('emits scene:turn with correct botId, sceneId, and event payload', async () => {
    await engine.start();
    const fn = vi.fn();
    engine.on('scene:turn', fn);

    const event = makeTurnEvent({ botId: 'bot-99', sceneId: 'mock-scene:room-1' });
    await engine.handleTurnEvent(event);

    expect(fn).toHaveBeenCalledOnce();
    const [botId, sceneId, turnEvent] = fn.mock.calls[0] as [string, string, typeof event];
    expect(botId).toBe('bot-99');
    expect(sceneId).toBe('mock-scene:room-1');
    expect(turnEvent.id).toBe(event.id);
  });

  it('emits scene:action with correct botId, sceneId, and ActionResult', async () => {
    await engine.start();
    const fn = vi.fn();
    engine.on('scene:action', fn);

    const event = makeTurnEvent({ botId: 'bot-77', sceneId: 'mock-scene:room-1' });
    const result = await engine.handleTurnEvent(event);

    expect(fn).toHaveBeenCalledOnce();
    const [botId, sceneId, emittedResult] = fn.mock.calls[0] as [
      string,
      string,
      typeof result,
    ];
    expect(botId).toBe('bot-77');
    expect(sceneId).toBe('mock-scene:room-1');
    expect(emittedResult.success).toBe(result.success);
    expect(emittedResult.action.type).toBe(result.action.type);
  });

  it('emits scene:turn before scene:action within a single handleTurnEvent call', async () => {
    await engine.start();
    const order: string[] = [];
    engine.on('scene:turn', () => order.push('turn'));
    engine.on('scene:action', () => order.push('action'));

    await engine.handleTurnEvent(makeTurnEvent({ sceneId: 'mock-scene:room-1' }));

    expect(order).toEqual(['turn', 'action']);
  });

  it('emits engine:error (and not scene:turn) when plugin resolution fails', async () => {
    await engine.start();
    const turnFn = vi.fn();
    const errorFn = vi.fn();
    engine.on('scene:turn', turnFn);
    engine.on('engine:error', errorFn);

    await engine.handleTurnEvent(makeTurnEvent({ sceneId: 'unknown:xyz' }));

    expect(turnFn).not.toHaveBeenCalled();
    expect(errorFn).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — Engine with real MemoryProvider storage
// ---------------------------------------------------------------------------

describe('integration: MemoryProvider as real storage', () => {
  let memory: MemoryProvider;
  let engine: LobsterEngine;
  let plugin: MockScenePlugin;
  let adapter: MockAIPlatformAdapter;

  beforeEach(async () => {
    memory = new MemoryProvider();
    plugin = new MockScenePlugin();
    adapter = new MockAIPlatformAdapter();
    engine = buildEngine({ plugin, adapter, storage: memory });
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('connects the MemoryProvider during engine.start()', async () => {
    const healthy = await memory.health();
    expect(healthy).toBe(true);
  });

  it('disconnects the MemoryProvider during engine.stop()', async () => {
    await engine.stop();
    const healthy = await memory.health();
    expect(healthy).toBe(false);
  });

  it('processes a turn successfully when backed by MemoryProvider', async () => {
    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'mock-scene:room-1' }),
    );

    expect(result.success).toBe(true);
  });

  it('persists data written to MemoryProvider independently of engine turns', async () => {
    await memory.set('greeting', 'hello');
    const value = await memory.get<string>('greeting');
    expect(value).toBe('hello');
  });

  it('data is cleared after engine.stop() disconnects MemoryProvider', async () => {
    await memory.set('transient', 42);
    await engine.stop();
    // After disconnect() the store is cleared — reconnect to query without error.
    await memory.connect();
    const value = await memory.get<number>('transient');
    expect(value).toBeNull();
    await memory.disconnect();
  });

  it('MemoryProvider health() returns false after stop()', async () => {
    await engine.stop();
    expect(await memory.health()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — StateManager integration with engine (hot/warm tier)
// ---------------------------------------------------------------------------

describe('integration: StateManager hot/warm tier', () => {
  let hotStorage: MemoryProvider;
  let warmStorage: MemoryProvider;
  let stateManager: StateManager;

  beforeEach(async () => {
    hotStorage = new MemoryProvider();
    warmStorage = new MemoryProvider();
    await hotStorage.connect();
    await warmStorage.connect();
    stateManager = new StateManager({
      hotStorage,
      warmStorage,
      hotTtl: 60,
      warmTtl: 300,
    });
  });

  afterEach(async () => {
    await hotStorage.disconnect();
    await warmStorage.disconnect();
  });

  it('stores and retrieves BotState from the hot tier', async () => {
    const state = makeBotState('bot-1');
    await stateManager.setBotState('bot-1', state);

    const retrieved = await stateManager.getBotState('bot-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionId).toBe('session-bot-1');
    expect(retrieved?.status).toBe('playing');
  });

  it('returns null for an unknown botId', async () => {
    const result = await stateManager.getBotState('nonexistent-bot');
    expect(result).toBeNull();
  });

  it('deletes BotState from all tiers', async () => {
    const state = makeBotState('bot-delete');
    await stateManager.setBotState('bot-delete', state);

    await stateManager.deleteBotState('bot-delete');
    const result = await stateManager.getBotState('bot-delete');
    expect(result).toBeNull();
  });

  it('promotes BotState from hot tier to warm tier', async () => {
    const state = makeBotState('bot-promote');
    await stateManager.setBotState('bot-promote', state);

    // Verify it's in hot storage.
    const hotKey = 'bot:state:bot-promote';
    const hotBefore = await hotStorage.get<BotState>(hotKey);
    expect(hotBefore).not.toBeNull();

    // Promote hot → warm.
    await stateManager.promote('bot-promote', 'hot', 'warm');

    // After promotion: hot is cleared, warm has it.
    const hotAfter = await hotStorage.get<BotState>(hotKey);
    expect(hotAfter).toBeNull();

    const warmAfter = await warmStorage.get<BotState>(hotKey);
    expect(warmAfter).not.toBeNull();
    expect(warmAfter?.sessionId).toBe('session-bot-promote');
  });

  it('promote is a no-op when source key does not exist', async () => {
    // Should not throw.
    await expect(
      stateManager.promote('nonexistent', 'hot', 'warm'),
    ).resolves.toBeUndefined();
  });

  it('getBotState falls through hot miss to warm tier', async () => {
    const state = makeBotState('bot-warm-only');
    // Write directly to warm, bypassing StateManager.setBotState (which writes hot).
    await warmStorage.set('bot:state:bot-warm-only', state);

    const retrieved = await stateManager.getBotState('bot-warm-only');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.sessionId).toBe('session-bot-warm-only');
  });

  it('stores and retrieves scene-scoped state', async () => {
    await stateManager.setSceneState<string>('room-42', 'phase', 'night');

    const value = await stateManager.getSceneState<string>('room-42', 'phase');
    expect(value).toBe('night');
  });

  it('scene state keys are isolated per sceneId', async () => {
    await stateManager.setSceneState<number>('room-1', 'score', 10);
    await stateManager.setSceneState<number>('room-2', 'score', 99);

    const r1 = await stateManager.getSceneState<number>('room-1', 'score');
    const r2 = await stateManager.getSceneState<number>('room-2', 'score');
    expect(r1).toBe(10);
    expect(r2).toBe(99);
  });

  it('StateManager.connect() connects all tier storages', async () => {
    const hot2 = new MemoryProvider();
    const warm2 = new MemoryProvider();
    const sm = new StateManager({ hotStorage: hot2, warmStorage: warm2 });

    await sm.connect();

    expect(await hot2.health()).toBe(true);
    expect(await warm2.health()).toBe(true);

    await sm.disconnect();
  });

  it('StateManager.disconnect() disconnects all tier storages', async () => {
    const hot3 = new MemoryProvider();
    const warm3 = new MemoryProvider();
    const sm = new StateManager({ hotStorage: hot3, warmStorage: warm3 });
    await sm.connect();

    await sm.disconnect();

    expect(await hot3.health()).toBe(false);
    expect(await warm3.health()).toBe(false);
  });

  it('deduplicates storage when same instance is used for hot and warm', async () => {
    const shared = new MemoryProvider();
    const sm = new StateManager({ hotStorage: shared, warmStorage: shared });

    await sm.connect();
    // connect() should have been called once (deduplication), not twice.
    expect(await shared.health()).toBe(true);

    await sm.disconnect();
    // disconnect() once → shared store is cleared and marked disconnected.
    expect(await shared.health()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 11 — Engine construction with config-time registration
// ---------------------------------------------------------------------------

describe('integration: engine construction with config-time registration', () => {
  it('registers plugins and adapters supplied in EngineConfig', async () => {
    const plugin = new MockScenePlugin({ name: 'config-plugin', sceneType: 'config-scene' });
    const adapter = new MockAIPlatformAdapter({ name: 'config-adapter' });

    const engine = new LobsterEngine({
      name: 'config-engine',
      plugins: [plugin],
      adapters: [adapter],
    });

    expect(engine.scenes.has('config-plugin')).toBe(true);
    expect(engine.adapters.has('config-adapter')).toBe(true);

    await engine.start();
    expect(plugin.initializeCallCount).toBe(1);
    expect(adapter.connectCallCount).toBe(1);
    await engine.stop();
  });

  it('wires storage supplied in EngineConfig and connects it on start()', async () => {
    const storage = new MockStorageProvider();
    const engine = new LobsterEngine({ name: 'storage-engine', storage });

    await engine.start();
    expect(storage.connected).toBe(true);
    await engine.stop();
    expect(storage.connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite 12 — Late plugin registration after start()
// ---------------------------------------------------------------------------

describe('integration: late plugin registration after engine.start()', () => {
  let engine: LobsterEngine;

  beforeEach(async () => {
    engine = buildEngine();
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('initialises a plugin registered after start() via fire-and-forget', async () => {
    const late = new MockScenePlugin({ name: 'late', sceneType: 'late-scene' });
    engine.use(late);

    // Flush the microtask queue so the async initialize() fires.
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(late.initializeCallCount).toBe(1);
  });

  it('can handle a turn on the late-registered plugin immediately after flush', async () => {
    const adapter = new MockAIPlatformAdapter();
    engine.registerAdapter(adapter);

    const late = new MockScenePlugin({ name: 'late2', sceneType: 'late-scene2' });
    engine.use(late);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    const result = await engine.handleTurnEvent(
      makeTurnEvent({ sceneId: 'late-scene2:room-1' }),
    );

    expect(result.success).toBe(true);
  });
});

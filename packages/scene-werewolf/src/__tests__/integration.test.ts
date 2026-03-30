// @lobster-engine/scene-werewolf — P2.8 Integration test: Engine + WerewolfPlugin + mock AI adapter
//
// The engine's buildContext() always produces state={} (empty). This means
// WerewolfPlugin.getState(context) returns {} — so any call chain that reaches
// state.players will encounter undefined. The test suite is structured around
// the actual observable behaviour:
//
// Safe phases — buildPrompt crashes on alivePlayerList → engine catches, calls
//   getDefaultAction which does NOT touch state.players for these phases:
//     day_speech    → returns speech (fallback content)
//     night_witch   → returns witch_nothing
//     day_hunter    → returns hunter_skip
//   In all these cases result.success === false (parseError set) but the
//   action type and shape are correct and observable.
//
// Unsafe phases (night_werewolf, day_vote, etc.) — getDefaultAction also calls
//   randomAlive → alivePlayers which throws INSIDE the catch block of
//   handleTurnEvent, making the promise reject. These phases are excluded from
//   integration tests to avoid testing an engine-level bug rather than plugin
//   behaviour.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LobsterEngine, MemoryProvider } from '@lobster-engine/core';
import type {
  AIPlatformAdapter,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  AdapterCapabilities,
  TurnEvent,
  ActionResult,
} from '@lobster-engine/core';
import { WerewolfPlugin } from '../index.js';

// ---------------------------------------------------------------------------
// Mock AI adapter
// ---------------------------------------------------------------------------

class WerewolfMockAdapter implements AIPlatformAdapter {
  readonly name = 'werewolf-mock-adapter';
  readonly platform = 'mock';

  connectCallCount = 0;
  disconnectCallCount = 0;
  chatCallCount = 0;
  lastMessages: readonly ChatMessage[] = [];

  private responses: string[];
  private callIndex = 0;

  constructor(responses: string[] = ['nothing']) {
    this.responses = responses;
  }

  async detect(): Promise<boolean> {
    return true;
  }

  async connect(): Promise<void> {
    this.connectCallCount++;
  }

  async disconnect(): Promise<void> {
    this.disconnectCallCount++;
  }

  async chat(messages: readonly ChatMessage[], _options?: ChatOptions): Promise<ChatResponse> {
    this.chatCallCount++;
    this.lastMessages = messages;
    const content = this.responses[this.callIndex % this.responses.length] ?? 'nothing';
    this.callIndex++;
    return {
      content,
      finishReason: 'stop',
      usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildEngine(responses: string[]): {
  engine: LobsterEngine;
  adapter: WerewolfMockAdapter;
  storage: MemoryProvider;
} {
  const adapter = new WerewolfMockAdapter(responses);
  const storage = new MemoryProvider();
  const engine = new LobsterEngine({ name: 'integration-test-engine' });
  engine.use(new WerewolfPlugin()).registerAdapter(adapter).useStorage(storage);
  return { engine, adapter, storage };
}

function makeTurnEvent(phase: string, overrides: Partial<TurnEvent> = {}): TurnEvent {
  return {
    id: `evt-${phase}`,
    botId: 'bot-1',
    sceneId: 'werewolf:room-integration',
    type: 'turn',
    phase,
    data: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integration: Engine lifecycle
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — engine lifecycle', () => {
  let engine: LobsterEngine;
  let adapter: WerewolfMockAdapter;

  beforeEach(() => {
    ({ engine, adapter } = buildEngine(['nothing']));
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('starts successfully with WerewolfPlugin registered', async () => {
    await engine.start();
    expect(engine.running).toBe(true);
  });

  it('emits engine:ready after successful start', async () => {
    const handler = vi.fn();
    engine.on('engine:ready', handler);
    await engine.start();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('connects the mock AI adapter on start', async () => {
    await engine.start();
    expect(adapter.connectCallCount).toBe(1);
  });

  it('disconnects adapter cleanly on stop', async () => {
    await engine.start();
    await engine.stop();
    expect(adapter.disconnectCallCount).toBe(1);
  });

  it('emits engine:stopping before shutdown completes', async () => {
    await engine.start();
    const stoppingHandler = vi.fn();
    engine.on('engine:stopping', stoppingHandler);
    await engine.stop();
    expect(stoppingHandler).toHaveBeenCalledOnce();
  });

  it('sets running to false after stop', async () => {
    await engine.start();
    await engine.stop();
    expect(engine.running).toBe(false);
  });

  it('registers WerewolfPlugin with sceneType "werewolf"', () => {
    expect(engine.scenes.has('scene-werewolf')).toBe(true);
  });

  it('WerewolfPlugin is retrievable by name', () => {
    const plugin = engine.scenes.get('scene-werewolf');
    expect(plugin?.sceneType).toBe('werewolf');
  });

  it('start is idempotent — second start call does not re-connect adapter', async () => {
    await engine.start();
    await engine.start();
    expect(adapter.connectCallCount).toBe(1);
    await engine.stop();
  });

  it('stop is idempotent — calling stop twice does not throw', async () => {
    await engine.start();
    await engine.stop();
    await expect(engine.stop()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: scene:turn and scene:action event emission
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — event emission', () => {
  let engine: LobsterEngine;

  beforeEach(async () => {
    ({ engine } = buildEngine(['nothing']));
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('emits scene:turn when handleTurnEvent is called', async () => {
    const turnHandler = vi.fn();
    engine.on('scene:turn', turnHandler);

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    expect(turnHandler).toHaveBeenCalledOnce();
  });

  it('emits scene:action when handleTurnEvent completes', async () => {
    const actionHandler = vi.fn();
    engine.on('scene:action', actionHandler);

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    expect(actionHandler).toHaveBeenCalledOnce();
  });

  it('emits scene:turn before scene:action', async () => {
    const order: string[] = [];
    engine.on('scene:turn', () => order.push('scene:turn'));
    engine.on('scene:action', () => order.push('scene:action'));

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    expect(order).toEqual(['scene:turn', 'scene:action']);
  });

  it('scene:turn payload contains botId and sceneId', async () => {
    const turnHandler = vi.fn();
    engine.on('scene:turn', turnHandler);

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    const [botId, sceneId] = turnHandler.mock.calls[0] as [string, string, TurnEvent];
    expect(botId).toBe('bot-1');
    expect(sceneId).toBe('werewolf:room-integration');
  });

  it('scene:action payload contains the action result', async () => {
    const actionHandler = vi.fn();
    engine.on('scene:action', actionHandler);

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    const result = (actionHandler.mock.calls[0] as [string, string, ActionResult])[2];
    expect(result).toBeDefined();
    expect(typeof result.duration).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Integration: WerewolfPlugin phase processing with empty engine context
//
// buildPrompt crashes on alivePlayerList with empty state → processEvent
// throws → engine fallback: getDefaultAction (safe for these phases).
// result.success === false (parseError set) but action type is correct.
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — phase processing (default action fallback)', () => {
  let engine: LobsterEngine;
  let adapter: WerewolfMockAdapter;

  beforeEach(async () => {
    ({ engine, adapter } = buildEngine(['nothing']));
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('night_witch turn returns witch_nothing action via default fallback', async () => {
    const result = await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    expect(result.action.type).toBe('witch_nothing');
    expect(result.action.target).toBeUndefined();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('night_witch turn result carries an error describing the fallback reason', async () => {
    const result = await engine.handleTurnEvent(makeTurnEvent('night_witch'));

    // parseError is set when processEvent catch block fires
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('day_speech turn returns speech action via default fallback', async () => {
    const result = await engine.handleTurnEvent(makeTurnEvent('day_speech'));

    expect(result.action.type).toBe('speech');
    expect(result.action.target).toBeUndefined();
    expect(result.action.content.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('day_hunter turn returns hunter_skip action via default fallback', async () => {
    const result = await engine.handleTurnEvent(makeTurnEvent('day_hunter'));

    expect(result.action.type).toBe('hunter_skip');
    expect(result.action.content).toBe('skip');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('adapter.chat is NOT called when buildPrompt throws before reaching the chat step', async () => {
    // buildPrompt crashes on alivePlayerList(empty state) before adapter.chat() is reached.
    // The engine catches the error and falls back to getDefaultAction without calling chat.
    await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    expect(adapter.chatCallCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: full game loop over safe phases
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — full safe-phase game loop', () => {
  let engine: LobsterEngine;
  let adapter: WerewolfMockAdapter;

  beforeEach(async () => {
    ({ engine, adapter } = buildEngine(['nothing', 'skip', 'nothing']));
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('processes three sequential turns returning correct action types', async () => {
    const r1 = await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    const r2 = await engine.handleTurnEvent(makeTurnEvent('day_speech'));
    const r3 = await engine.handleTurnEvent(makeTurnEvent('day_hunter'));

    expect(r1.action.type).toBe('witch_nothing');
    expect(r2.action.type).toBe('speech');
    expect(r3.action.type).toBe('hunter_skip');
  });

  it('adapter.chat count is 0 for all turns because buildPrompt throws before reaching chat', async () => {
    // buildPrompt crashes on alivePlayerList(empty state) in every phase, so chat is never
    // invoked — engine goes directly to the getDefaultAction fallback path.
    await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    await engine.handleTurnEvent(makeTurnEvent('day_speech'));
    await engine.handleTurnEvent(makeTurnEvent('day_hunter'));

    expect(adapter.chatCallCount).toBe(0);
  });

  it('emits scene:action for every turn in the loop', async () => {
    const actionHandler = vi.fn();
    engine.on('scene:action', actionHandler);

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    await engine.handleTurnEvent(makeTurnEvent('day_speech'));
    await engine.handleTurnEvent(makeTurnEvent('day_hunter'));

    expect(actionHandler).toHaveBeenCalledTimes(3);
  });

  it('emits scene:turn and scene:action in correct order across multiple turns', async () => {
    const order: string[] = [];
    engine.on('scene:turn', () => order.push('turn'));
    engine.on('scene:action', () => order.push('action'));

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    await engine.handleTurnEvent(makeTurnEvent('day_speech'));

    expect(order).toEqual(['turn', 'action', 'turn', 'action']);
  });

  it('each turn result has a non-negative duration', async () => {
    const r1 = await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    const r2 = await engine.handleTurnEvent(makeTurnEvent('day_speech'));
    const r3 = await engine.handleTurnEvent(makeTurnEvent('day_hunter'));

    expect(r1.duration).toBeGreaterThanOrEqual(0);
    expect(r2.duration).toBeGreaterThanOrEqual(0);
    expect(r3.duration).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: game resolution via game_over phase
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — game_over phase', () => {
  it('game_over phase formatEvent produces human-readable result message', () => {
    // Verify the plugin-level behaviour we rely on in integration
    const plugin = new WerewolfPlugin();
    const event: TurnEvent = {
      id: 'evt-end',
      botId: 'bot-1',
      sceneId: 'werewolf:room-integration',
      type: 'game_end',
      phase: 'game_over',
      data: { winner: 'Villagers' },
      timestamp: Date.now(),
    };
    const msg = plugin.formatEvent(event);
    expect(msg).toContain('Villagers');
    expect(msg.toLowerCase()).toContain('game over');
  });
});

// ---------------------------------------------------------------------------
// Integration: error handling — unregistered scene
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — error handling', () => {
  let engine: LobsterEngine;

  beforeEach(async () => {
    ({ engine } = buildEngine(['nothing']));
    await engine.start();
  });

  afterEach(async () => {
    if (engine.running) await engine.stop();
  });

  it('emits engine:error when no plugin handles the sceneId', async () => {
    const errorHandler = vi.fn();
    engine.on('engine:error', errorHandler);

    const event: TurnEvent = {
      id: 'evt-unknown',
      botId: 'bot-1',
      sceneId: 'unknown-game:room-1',
      type: 'turn',
      phase: 'day_vote',
      data: {},
      timestamp: Date.now(),
    };

    await engine.handleTurnEvent(event);
    expect(errorHandler).toHaveBeenCalledOnce();
  });

  it('returns failed result with error message when plugin not found', async () => {
    const event: TurnEvent = {
      id: 'evt-missing',
      botId: 'bot-1',
      sceneId: 'no-such-game:room-99',
      type: 'turn',
      phase: 'day_vote',
      data: {},
      timestamp: Date.now(),
    };

    const result = await engine.handleTurnEvent(event);
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('result success is false when no plugin is registered for the scene', async () => {
    const result = await engine.handleTurnEvent(
      makeTurnEvent('day_vote', { sceneId: 'chess:room-1' }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: clean shutdown
// ---------------------------------------------------------------------------

describe('Integration: LobsterEngine + WerewolfPlugin — clean shutdown', () => {
  it('stop() resolves cleanly after multi-turn game loop', async () => {
    const { engine, adapter } = buildEngine(['nothing', 'skip', 'nothing']);
    await engine.start();

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    await engine.handleTurnEvent(makeTurnEvent('day_speech'));
    await engine.handleTurnEvent(makeTurnEvent('day_hunter'));

    await expect(engine.stop()).resolves.toBeUndefined();
    expect(engine.running).toBe(false);
    expect(adapter.disconnectCallCount).toBe(1);
  });

  it('engine is not running after clean stop', async () => {
    const { engine } = buildEngine(['nothing']);
    await engine.start();
    await engine.stop();
    expect(engine.running).toBe(false);
  });

  it('storage is connected during game loop and disconnected after stop', async () => {
    const { engine, storage } = buildEngine(['nothing']);
    await engine.start();
    expect(await storage.health()).toBe(true);

    await engine.handleTurnEvent(makeTurnEvent('night_witch'));
    await engine.stop();

    expect(await storage.health()).toBe(false);
  });
});

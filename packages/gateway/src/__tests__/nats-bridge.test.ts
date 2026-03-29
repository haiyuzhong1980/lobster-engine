// @lobster-engine/gateway — NatsBridge unit tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NatsBridge, parseBotActionSubject, parseSceneBroadcastSubject } from '../nats-bridge.js';
import type { NatsClient, SubscriptionHandle } from '@lobster-engine/core';
import type { WSManager } from '../ws.js';
import type { SSEManager } from '../sse.js';

// ---------------------------------------------------------------------------
// Helpers — lightweight stub factories
// ---------------------------------------------------------------------------

/**
 * Build a NatsClient stub that captures all subscribe calls so tests can
 * trigger message delivery manually via `trigger(subject, data)`.
 */
function makeNatsStub(): {
  client: NatsClient;
  trigger: (subject: string, data: unknown) => Promise<void>;
} {
  const handlers = new Map<string, Array<(data: unknown) => Promise<void>>>();

  const client = {
    subscribe: vi.fn(
      (subject: string, handler: (data: unknown) => Promise<void>): SubscriptionHandle => {
        const list = handlers.get(subject) ?? [];
        list.push(handler);
        handlers.set(subject, list);

        let unsubscribed = false;
        return {
          unsubscribe: vi.fn(() => {
            if (!unsubscribed) {
              unsubscribed = true;
              const current = handlers.get(subject) ?? [];
              handlers.set(
                subject,
                current.filter((h) => h !== handler),
              );
            }
          }),
        };
      },
    ),
    publish: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: vi.fn(() => true),
    request: vi.fn(),
    queueSubscribe: vi.fn(),
    drain: vi.fn(),
    health: vi.fn(() => ({ connected: true, server: 'localhost:4222' })),
  } as unknown as NatsClient;

  const trigger = async (subject: string, data: unknown): Promise<void> => {
    const list = handlers.get(subject) ?? [];
    for (const h of list) {
      await h(data);
    }
  };

  return { client, trigger };
}

/** Build a WSManager stub that records broadcastRawToScene calls. */
function makeWSManagerStub(): WSManager {
  return {
    broadcastRawToScene: vi.fn(),
    broadcastToScene: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    startHeartbeat: vi.fn(),
    stopHeartbeat: vi.fn(),
    getClient: vi.fn(),
    getClientCount: vi.fn(() => 0),
    getSceneClientCount: vi.fn(() => 0),
    getAllClients: vi.fn(() => []),
  } as unknown as WSManager;
}

/** Build an SSEManager stub that records broadcastToScene calls. */
function makeSSEManagerStub(): SSEManager {
  return {
    broadcastToScene: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    connectionCount: vi.fn(() => 0),
    totalConnections: vi.fn(() => 0),
    replayMissedEvents: vi.fn(),
  } as unknown as SSEManager;
}

// ---------------------------------------------------------------------------
// Subject parsing
// ---------------------------------------------------------------------------

describe('parseBotActionSubject', () => {
  it('extracts botId from a well-formed subject', () => {
    expect(parseBotActionSubject('bot.abc123.action')).toBe('abc123');
  });

  it('extracts botId containing UUID-like characters', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(parseBotActionSubject(`bot.${uuid}.action`)).toBe(uuid);
  });

  it('returns undefined for the wildcard subject itself', () => {
    expect(parseBotActionSubject('bot.*.action')).toBe('*');
  });

  it('returns undefined for unrelated subjects', () => {
    expect(parseBotActionSubject('scene.foo.broadcast')).toBeUndefined();
    expect(parseBotActionSubject('bot.foo.state')).toBeUndefined();
    expect(parseBotActionSubject('bot.action')).toBeUndefined();
    expect(parseBotActionSubject('')).toBeUndefined();
  });
});

describe('parseSceneBroadcastSubject', () => {
  it('extracts sceneId from a well-formed subject', () => {
    expect(parseSceneBroadcastSubject('scene.werewolf:room1.broadcast')).toBe(
      'werewolf:room1',
    );
  });

  it('extracts simple sceneId', () => {
    expect(parseSceneBroadcastSubject('scene.s1.broadcast')).toBe('s1');
  });

  it('returns undefined for unrelated subjects', () => {
    expect(parseSceneBroadcastSubject('bot.abc.action')).toBeUndefined();
    expect(parseSceneBroadcastSubject('scene.foo.state')).toBeUndefined();
    expect(parseSceneBroadcastSubject('scene.broadcast')).toBeUndefined();
    expect(parseSceneBroadcastSubject('')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// NatsBridge — start / stop
// ---------------------------------------------------------------------------

describe('NatsBridge — lifecycle', () => {
  it('subscribes to three subjects on start()', async () => {
    const { client } = makeNatsStub();
    const ws = makeWSManagerStub();
    const sse = makeSSEManagerStub();

    const bridge = new NatsBridge(client, ws, sse);
    await bridge.start();

    expect(client.subscribe).toHaveBeenCalledTimes(3);
    const subjects = (client.subscribe as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    );
    expect(subjects).toContain('bot.*.action');
    expect(subjects).toContain('scene.*.broadcast');
    expect(subjects).toContain('system.metrics');
  });

  it('calling start() twice is idempotent', async () => {
    const { client } = makeNatsStub();
    const bridge = new NatsBridge(client, makeWSManagerStub(), makeSSEManagerStub());

    await bridge.start();
    await bridge.start(); // second call must be a no-op

    expect(client.subscribe).toHaveBeenCalledTimes(3);
  });

  it('unsubscribes all handles on stop()', async () => {
    const { client } = makeNatsStub();
    const ws = makeWSManagerStub();
    const sse = makeSSEManagerStub();

    const bridge = new NatsBridge(client, ws, sse);
    await bridge.start();
    await bridge.stop();

    const subscribeMock = client.subscribe as ReturnType<typeof vi.fn>;
    const allHandles = subscribeMock.mock.results.map(
      (r: { type: string; value: unknown }) => (r.value as SubscriptionHandle).unsubscribe,
    );

    for (const unsubscribeFn of allHandles) {
      expect(unsubscribeFn).toHaveBeenCalledOnce();
    }
  });

  it('calling stop() without start() is a safe no-op', async () => {
    const bridge = new NatsBridge(
      makeNatsStub().client,
      makeWSManagerStub(),
      makeSSEManagerStub(),
    );
    await expect(bridge.stop()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// NatsBridge — missing NATS (disabled bridge)
// ---------------------------------------------------------------------------

describe('NatsBridge — no NatsClient provided', () => {
  it('start() is a no-op and does not throw', async () => {
    const ws = makeWSManagerStub();
    const sse = makeSSEManagerStub();

    const bridge = new NatsBridge(undefined, ws, sse);
    await expect(bridge.start()).resolves.toBeUndefined();

    // No forwarding methods should have been called.
    expect(ws.broadcastRawToScene).not.toHaveBeenCalled();
    expect(sse.broadcastToScene).not.toHaveBeenCalled();
  });

  it('stop() is a no-op and does not throw', async () => {
    const bridge = new NatsBridge(undefined, makeWSManagerStub(), makeSSEManagerStub());
    await expect(bridge.stop()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// NatsBridge — bot.*.action message forwarding
// ---------------------------------------------------------------------------

describe('NatsBridge — bot.*.action forwarding', () => {
  let nats: ReturnType<typeof makeNatsStub>;
  let ws: WSManager;
  let sse: SSEManager;
  let bridge: NatsBridge;

  beforeEach(async () => {
    nats = makeNatsStub();
    ws = makeWSManagerStub();
    sse = makeSSEManagerStub();
    bridge = new NatsBridge(nats.client, ws, sse);
    await bridge.start();
  });

  it('forwards a bot action to WSManager with the correct sceneId', async () => {
    await nats.trigger('bot.*.action', {
      botId: 'bot-1',
      sceneId: 'scene-A',
      actionType: 'speak',
      content: 'hello',
    });

    expect(ws.broadcastRawToScene).toHaveBeenCalledWith(
      'scene-A',
      'bot.action',
      expect.objectContaining({ botId: 'bot-1', sceneId: 'scene-A' }),
    );
  });

  it('forwards a bot action to SSEManager for the same scene', async () => {
    await nats.trigger('bot.*.action', {
      botId: 'bot-2',
      sceneId: 'scene-B',
      content: 'wave',
    });

    expect(sse.broadcastToScene).toHaveBeenCalledWith(
      'scene-B',
      expect.objectContaining({ type: 'scene:action' }),
    );
  });

  it('drops messages missing a sceneId field', async () => {
    await nats.trigger('bot.*.action', { botId: 'bot-3', content: 'no-scene' });

    expect(ws.broadcastRawToScene).not.toHaveBeenCalled();
    expect(sse.broadcastToScene).not.toHaveBeenCalled();
  });

  it('drops non-object payloads gracefully', async () => {
    await nats.trigger('bot.*.action', 'bad-string-payload');
    await nats.trigger('bot.*.action', null);
    await nats.trigger('bot.*.action', 42);

    expect(ws.broadcastRawToScene).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NatsBridge — scene.*.broadcast message forwarding
// ---------------------------------------------------------------------------

describe('NatsBridge — scene.*.broadcast forwarding', () => {
  let nats: ReturnType<typeof makeNatsStub>;
  let ws: WSManager;
  let sse: SSEManager;
  let bridge: NatsBridge;

  beforeEach(async () => {
    nats = makeNatsStub();
    ws = makeWSManagerStub();
    sse = makeSSEManagerStub();
    bridge = new NatsBridge(nats.client, ws, sse);
    await bridge.start();
  });

  it('forwards a scene broadcast to WSManager', async () => {
    await nats.trigger('scene.*.broadcast', {
      sceneId: 'room-1',
      type: 'game.started',
      botId: 'bot-X',
      phase: 'night',
      data: { round: 1 },
      timestamp: 1234567890,
    });

    expect(ws.broadcastRawToScene).toHaveBeenCalledWith(
      'room-1',
      'game.started',
      expect.objectContaining({ sceneId: 'room-1', type: 'game.started' }),
    );
  });

  it('forwards a scene broadcast to SSEManager as scene:turn', async () => {
    await nats.trigger('scene.*.broadcast', {
      sceneId: 'room-2',
      type: 'vote.cast',
      botId: 'bot-Y',
      phase: 'vote',
      data: { choice: 'village' },
      timestamp: 9999,
    });

    expect(sse.broadcastToScene).toHaveBeenCalledWith(
      'room-2',
      expect.objectContaining({ type: 'scene:turn' }),
    );
  });

  it('uses a default event type of "scene.broadcast" when type is absent', async () => {
    await nats.trigger('scene.*.broadcast', {
      sceneId: 'room-3',
      botId: 'bot-Z',
    });

    expect(ws.broadcastRawToScene).toHaveBeenCalledWith(
      'room-3',
      'scene.broadcast',
      expect.anything(),
    );
  });

  it('drops messages missing a sceneId', async () => {
    await nats.trigger('scene.*.broadcast', { type: 'ping', botId: 'bot-W' });

    expect(ws.broadcastRawToScene).not.toHaveBeenCalled();
    expect(sse.broadcastToScene).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NatsBridge — system.metrics message forwarding
// ---------------------------------------------------------------------------

describe('NatsBridge — system.metrics forwarding', () => {
  let nats: ReturnType<typeof makeNatsStub>;
  let ws: WSManager;
  let sse: SSEManager;

  beforeEach(async () => {
    nats = makeNatsStub();
    ws = makeWSManagerStub();
    sse = makeSSEManagerStub();

    const bridge = new NatsBridge(nats.client, ws, sse);
    await bridge.start();
  });

  it('forwards system metrics to the __system__ scene in WSManager', async () => {
    await nats.trigger('system.metrics', { cpu: 12.5, memory: 4096 });

    expect(ws.broadcastRawToScene).toHaveBeenCalledWith(
      '__system__',
      'system.metrics',
      expect.objectContaining({ cpu: 12.5 }),
    );
  });

  it('forwards system metrics to the __system__ scene in SSEManager', async () => {
    await nats.trigger('system.metrics', { activeConnections: 42 });

    expect(sse.broadcastToScene).toHaveBeenCalledWith(
      '__system__',
      expect.objectContaining({ type: 'engine:ready' }),
    );
  });

  it('drops non-object metric payloads gracefully', async () => {
    await nats.trigger('system.metrics', 'not-an-object');

    expect(ws.broadcastRawToScene).not.toHaveBeenCalled();
    expect(sse.broadcastToScene).not.toHaveBeenCalled();
  });
});

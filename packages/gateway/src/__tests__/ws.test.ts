// @lobster-engine/gateway — WSManager unit tests

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { WSManager } from '../ws.js';
import type { WSConfig, OutboundMessage } from '../ws.js';
import type { EngineEvent } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

/**
 * Minimal WebSocket mock that records sent messages and emits events.
 * Extends EventEmitter so that `ws.on('message', ...)` etc. work.
 */
class MockWebSocket extends EventEmitter {
  readonly sent: string[] = [];
  readyState: number = WebSocket.OPEN;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED;
    this.emit('close', code, reason);
  }

  /** Helper: parse the last sent message. */
  lastMessage(): OutboundMessage {
    const raw = this.sent[this.sent.length - 1];
    if (raw === undefined) throw new Error('No messages sent');
    return JSON.parse(raw) as OutboundMessage;
  }

  /** Helper: parse all sent messages. */
  allMessages(): OutboundMessage[] {
    return this.sent.map((r) => JSON.parse(r) as OutboundMessage);
  }

  /** Simulate receiving a message from the client side. */
  simulateMessage(payload: unknown): void {
    this.emit('message', JSON.stringify(payload));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManager(config?: WSConfig): WSManager {
  return new WSManager(config);
}

async function addMockClient(
  manager: WSManager,
  ws: MockWebSocket,
  token?: string,
): Promise<string> {
  const id = await manager.addClient(ws as unknown as WebSocket, token);
  if (id === null) throw new Error('addClient returned null');
  return id;
}

function sampleEvent(sceneId: string): EngineEvent {
  return { type: 'scene:joined', payload: { botId: 'bot-1', sceneId } };
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

describe('WSManager — connection management', () => {
  let manager: WSManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('assigns a unique client ID on connection', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36); // UUID format
  });

  it('sends a "connected" message on successful connection', async () => {
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    const msg = ws.lastMessage();
    expect(msg.type).toBe('connected');
    expect((msg.data as Record<string, unknown>)['clientId']).toBeTruthy();
  });

  it('tracks connected client count', async () => {
    expect(manager.getClientCount()).toBe(0);
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    await addMockClient(manager, ws1);
    expect(manager.getClientCount()).toBe(1);
    await addMockClient(manager, ws2);
    expect(manager.getClientCount()).toBe(2);
  });

  it('getClient returns the registered client', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    const client = manager.getClient(id);
    expect(client).not.toBeUndefined();
    expect(client!.id).toBe(id);
  });

  it('removes client on socket close event', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    expect(manager.getClientCount()).toBe(1);
    ws.close();
    expect(manager.getClientCount()).toBe(0);
    expect(manager.getClient(id)).toBeUndefined();
  });

  it('removes client on socket error event', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    ws.emit('error', new Error('network error'));
    expect(manager.getClient(id)).toBeUndefined();
  });

  it('removeClient is idempotent for unknown IDs', () => {
    expect(() => manager.removeClient('does-not-exist')).not.toThrow();
  });

  it('getAllClients returns readonly snapshots', async () => {
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    await addMockClient(manager, ws1);
    await addMockClient(manager, ws2);
    const all = manager.getAllClients();
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('WSManager — authentication', () => {
  it('allows connection when no validateToken is configured', async () => {
    const manager = makeManager();
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws, 'any-token');
    expect(id).toBeTruthy();
  });

  it('allows connection when token is valid', async () => {
    const manager = makeManager({
      validateToken: (t) => t === 'valid-token',
    });
    const ws = new MockWebSocket();
    const id = await manager.addClient(ws as unknown as WebSocket, 'valid-token');
    expect(id).not.toBeNull();
  });

  it('rejects connection when token is invalid and closes socket', async () => {
    const manager = makeManager({
      validateToken: (t) => t === 'valid-token',
    });
    const ws = new MockWebSocket();
    const id = await manager.addClient(ws as unknown as WebSocket, 'bad-token');
    expect(id).toBeNull();
    expect(ws.readyState).toBe(WebSocket.CLOSED);
    expect(manager.getClientCount()).toBe(0);
  });

  it('supports async validateToken', async () => {
    const manager = makeManager({
      validateToken: async (t) => {
        await Promise.resolve();
        return t === 'async-token';
      },
    });
    const ws = new MockWebSocket();
    const id = await manager.addClient(ws as unknown as WebSocket, 'async-token');
    expect(id).not.toBeNull();
  });

  it('rejects when async validateToken returns false', async () => {
    const manager = makeManager({
      validateToken: async () => false,
    });
    const ws = new MockWebSocket();
    const id = await manager.addClient(ws as unknown as WebSocket, 'token');
    expect(id).toBeNull();
    expect(manager.getClientCount()).toBe(0);
  });

  it('allows connection with no token when validateToken is configured', async () => {
    // No token provided — skip validation entirely (token is undefined)
    const manager = makeManager({
      validateToken: (_t) => false, // would reject if called
    });
    const ws = new MockWebSocket();
    const id = await manager.addClient(ws as unknown as WebSocket, undefined);
    expect(id).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scene subscription
// ---------------------------------------------------------------------------

describe('WSManager — scene subscription', () => {
  let manager: WSManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('subscribe sends "subscribed" ack to client', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    ws.sent.length = 0; // clear "connected" message

    manager.subscribe(id, 'scene-1');
    const msg = ws.lastMessage();
    expect(msg.type).toBe('subscribed');
    expect((msg.data as Record<string, unknown>)['sceneId']).toBe('scene-1');
  });

  it('getSceneClientCount increments on subscribe', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    expect(manager.getSceneClientCount('scene-1')).toBe(0);
    manager.subscribe(id, 'scene-1');
    expect(manager.getSceneClientCount('scene-1')).toBe(1);
  });

  it('unsubscribe removes from scene and sends "unsubscribed" ack', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'scene-1');
    ws.sent.length = 0;

    manager.unsubscribe(id, 'scene-1');
    expect(manager.getSceneClientCount('scene-1')).toBe(0);
    const msg = ws.lastMessage();
    expect(msg.type).toBe('unsubscribed');
  });

  it('removes scene from index when last subscriber leaves', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'scene-x');
    manager.unsubscribe(id, 'scene-x');
    expect(manager.getSceneClientCount('scene-x')).toBe(0);
  });

  it('client subscriptions are tracked on the client object', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'scene-a');
    manager.subscribe(id, 'scene-b');
    const client = manager.getClient(id)!;
    expect(client.subscriptions.has('scene-a')).toBe(true);
    expect(client.subscriptions.has('scene-b')).toBe(true);
  });

  it('unsubscribes all scenes when client disconnects', async () => {
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    const id1 = await addMockClient(manager, ws1);
    const id2 = await addMockClient(manager, ws2);

    manager.subscribe(id1, 'scene-shared');
    manager.subscribe(id2, 'scene-shared');
    expect(manager.getSceneClientCount('scene-shared')).toBe(2);

    ws1.close();
    expect(manager.getSceneClientCount('scene-shared')).toBe(1);
  });

  it('returns false from subscribe for unknown clientId', () => {
    const result = manager.subscribe('non-existent', 'scene-1');
    expect(result).toBe(false);
  });

  it('enforces maxConnectionsPerScene limit', async () => {
    const limit = 3;
    const mgr = makeManager({ maxConnectionsPerScene: limit });

    // Fill up the scene
    const fillers: MockWebSocket[] = [];
    for (let i = 0; i < limit; i++) {
      const ws = new MockWebSocket();
      const clientId = await addMockClient(mgr, ws);
      fillers.push(ws);
      mgr.subscribe(clientId, 'crowded');
    }
    expect(mgr.getSceneClientCount('crowded')).toBe(limit);

    // One more should be rejected
    const wsExtra = new MockWebSocket();
    const extraId = await addMockClient(mgr, wsExtra);
    wsExtra.sent.length = 0; // clear "connected"
    const accepted = mgr.subscribe(extraId, 'crowded');
    expect(accepted).toBe(false);

    const msg = wsExtra.lastMessage();
    expect(msg.type).toBe('error');
    expect((msg.data as Record<string, unknown>)['code']).toBe('SCENE_FULL');
    expect(mgr.getSceneClientCount('crowded')).toBe(limit);
  });
});

// ---------------------------------------------------------------------------
// Inbound message handling
// ---------------------------------------------------------------------------

describe('WSManager — inbound message handling', () => {
  let manager: WSManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('processes subscribe message from client', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    ws.sent.length = 0;

    ws.simulateMessage({ type: 'subscribe', sceneId: 'scene-msg' });
    expect(manager.getSceneClientCount('scene-msg')).toBe(1);

    const msg = ws.lastMessage();
    expect(msg.type).toBe('subscribed');
  });

  it('processes unsubscribe message from client', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'scene-2');
    ws.sent.length = 0;

    ws.simulateMessage({ type: 'unsubscribe', sceneId: 'scene-2' });
    expect(manager.getSceneClientCount('scene-2')).toBe(0);
    expect(ws.lastMessage().type).toBe('unsubscribed');
  });

  it('handles pong message by updating lastPingAt', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    const before = manager.getClient(id)!.lastPingAt;

    await new Promise((r) => setTimeout(r, 5));
    ws.simulateMessage({ type: 'pong' });

    const after = manager.getClient(id)!.lastPingAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('replies with error for malformed JSON', async () => {
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    ws.emit('message', '{not valid json');
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect((msg.data as Record<string, unknown>)['code']).toBe('INVALID_MESSAGE');
  });

  it('replies with error for unknown message type', async () => {
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    ws.simulateMessage({ type: 'teleport', destination: 'moon' });
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect((msg.data as Record<string, unknown>)['code']).toBe('UNKNOWN_MESSAGE_TYPE');
  });

  it('replies with error for subscribe without sceneId', async () => {
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    ws.simulateMessage({ type: 'subscribe' });
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect((msg.data as Record<string, unknown>)['code']).toBe('MISSING_SCENE_ID');
  });

  it('replies with error for unsubscribe without sceneId', async () => {
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    ws.simulateMessage({ type: 'unsubscribe' });
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect((msg.data as Record<string, unknown>)['code']).toBe('MISSING_SCENE_ID');
  });

  it('ws.on(pong) updates lastPingAt', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    const before = manager.getClient(id)!.lastPingAt;

    await new Promise((r) => setTimeout(r, 5));
    ws.emit('pong');

    const after = manager.getClient(id)!.lastPingAt;
    expect(after).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// Event broadcast
// ---------------------------------------------------------------------------

describe('WSManager — broadcastToScene', () => {
  let manager: WSManager;

  beforeEach(() => {
    manager = makeManager();
  });

  it('delivers event to subscribed clients', async () => {
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    const id1 = await addMockClient(manager, ws1);
    const id2 = await addMockClient(manager, ws2);

    manager.subscribe(id1, 'battle');
    manager.subscribe(id2, 'battle');
    ws1.sent.length = 0;
    ws2.sent.length = 0;

    const event = sampleEvent('battle');
    manager.broadcastToScene('battle', event);

    expect(ws1.sent).toHaveLength(1);
    expect(ws2.sent).toHaveLength(1);

    const msg1 = ws1.lastMessage();
    expect(msg1.type).toBe('event');
    expect((msg1.data as EngineEvent).type).toBe('scene:joined');
  });

  it('does not deliver to clients subscribed to a different scene', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'other-scene');
    ws.sent.length = 0;

    manager.broadcastToScene('battle', sampleEvent('battle'));
    expect(ws.sent).toHaveLength(0);
  });

  it('skips clients with non-OPEN readyState', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'arena');
    ws.sent.length = 0;

    ws.readyState = WebSocket.CLOSING;
    manager.broadcastToScene('arena', sampleEvent('arena'));
    expect(ws.sent).toHaveLength(0);
  });

  it('is a no-op when scene has no subscribers', () => {
    // Should not throw
    expect(() =>
      manager.broadcastToScene('empty-scene', sampleEvent('empty-scene')),
    ).not.toThrow();
  });

  it('includes a timestamp in the broadcast envelope', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 's1');
    ws.sent.length = 0;

    const before = Date.now();
    manager.broadcastToScene('s1', sampleEvent('s1'));
    const after = Date.now();

    const msg = ws.lastMessage();
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(after);
  });

  it('broadcastRawToScene sends custom type and data', async () => {
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);
    manager.subscribe(id, 'raw-scene');
    ws.sent.length = 0;

    manager.broadcastRawToScene('raw-scene', 'custom:event', { foo: 'bar' });
    const msg = ws.lastMessage();
    expect(msg.type).toBe('custom:event');
    expect((msg.data as Record<string, unknown>)['foo']).toBe('bar');
  });
});

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

describe('WSManager — heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends ping messages at the configured interval', async () => {
    const manager = makeManager({ heartbeatIntervalMs: 1_000 });
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    manager.startHeartbeat();
    vi.advanceTimersByTime(1_000);

    const pings = ws.allMessages().filter((m) => m.type === 'ping');
    expect(pings.length).toBeGreaterThanOrEqual(1);
    manager.stopHeartbeat();
  });

  it('stopHeartbeat prevents further pings', async () => {
    const manager = makeManager({ heartbeatIntervalMs: 500 });
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    manager.startHeartbeat();
    manager.stopHeartbeat();
    vi.advanceTimersByTime(2_000);

    const pings = ws.allMessages().filter((m) => m.type === 'ping');
    expect(pings).toHaveLength(0);
  });

  it('startHeartbeat is idempotent — does not double-register', async () => {
    const manager = makeManager({ heartbeatIntervalMs: 1_000 });
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);
    ws.sent.length = 0;

    manager.startHeartbeat();
    manager.startHeartbeat(); // second call should be no-op
    vi.advanceTimersByTime(1_000);

    const pings = ws.allMessages().filter((m) => m.type === 'ping');
    // Should be exactly 1, not 2
    expect(pings).toHaveLength(1);
    manager.stopHeartbeat();
  });

  it('closes stale connections after two heartbeat intervals without pong', async () => {
    const manager = makeManager({ heartbeatIntervalMs: 1_000 });
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);

    // Override lastPingAt to be very old
    const staleTime = Date.now() - 3_000;
    // Access through the private internal map via a cast to test the eviction
    const anyManager = manager as unknown as {
      clients: Map<string, { lastPingAt: number }>;
    };
    const internal = anyManager.clients.get(id);
    if (internal) {
      internal.lastPingAt = staleTime;
    }

    manager.startHeartbeat();
    vi.advanceTimersByTime(1_000);

    expect(manager.getClient(id)).toBeUndefined();
    expect(manager.getClientCount()).toBe(0);
    manager.stopHeartbeat();
  });

  it('removes disconnected sockets (non-OPEN) during heartbeat tick', async () => {
    const manager = makeManager({ heartbeatIntervalMs: 500 });
    const ws = new MockWebSocket();
    const id = await addMockClient(manager, ws);

    ws.readyState = WebSocket.CLOSED; // simulate dropped connection

    manager.startHeartbeat();
    vi.advanceTimersByTime(500);

    expect(manager.getClient(id)).toBeUndefined();
    manager.stopHeartbeat();
  });
});

// ---------------------------------------------------------------------------
// Message envelope format
// ---------------------------------------------------------------------------

describe('OutboundMessage envelope', () => {
  it('every sent message has type, data, and timestamp fields', async () => {
    const manager = makeManager();
    const ws = new MockWebSocket();
    await addMockClient(manager, ws);

    for (const raw of ws.sent) {
      const msg = JSON.parse(raw) as OutboundMessage;
      expect(typeof msg.type).toBe('string');
      expect('data' in msg).toBe(true);
      expect(typeof msg.timestamp).toBe('number');
    }
  });
});

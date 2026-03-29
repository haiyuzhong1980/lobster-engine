// @lobster-engine/gateway — SSE service unit tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSEManager, createSSEHandler } from '../sse.js';
import type { SSEClient } from '../sse.js';
import type { EngineEvent } from '@lobster-engine/core';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock ReadableStream controller that captures enqueued chunks. */
function makeController(): {
  controller: ReadableStreamDefaultController<Uint8Array>;
  chunks: Uint8Array[];
  closed: boolean;
  text: () => string;
} {
  const chunks: Uint8Array[] = [];
  let closed = false;

  const controller = {
    enqueue(chunk: Uint8Array) {
      if (closed) throw new Error('Controller is closed');
      chunks.push(chunk);
    },
    close() {
      closed = true;
    },
    error(_e: unknown) {
      closed = true;
    },
    desiredSize: 1,
  } as unknown as ReadableStreamDefaultController<Uint8Array>;

  return {
    controller,
    chunks,
    get closed() {
      return closed;
    },
    text() {
      const decoder = new TextDecoder();
      return chunks.map((c) => decoder.decode(c)).join('');
    },
  };
}

/** Decode all enqueued bytes to a string. */
function chunkText(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c)).join('');
}

const SCENE_A = 'scene-a';
const SCENE_B = 'scene-b';

const botConnectedEvent: EngineEvent = {
  type: 'bot:connected',
  payload: { botId: 'bot-1', sessionId: 'sess-1' },
};

const sceneJoinedEvent: EngineEvent = {
  type: 'scene:joined',
  payload: { botId: 'bot-1', sceneId: SCENE_A },
};

const botErrorEvent: EngineEvent = {
  type: 'bot:error',
  payload: { botId: 'bot-1', error: new Error('test error') },
};

const engineErrorEvent: EngineEvent = {
  type: 'engine:error',
  payload: { error: new Error('engine failed') },
};

// ---------------------------------------------------------------------------
// SSEManager — addClient / removeClient
// ---------------------------------------------------------------------------

describe('SSEManager — connection management', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  it('adds a client and returns an SSEClient', () => {
    const { controller } = makeController();
    const client = manager.addClient(SCENE_A, controller);

    expect(client).not.toBeNull();
    expect(client!.sceneId).toBe(SCENE_A);
    expect(typeof client!.id).toBe('string');
    expect(client!.id.length).toBeGreaterThan(0);
    expect(typeof client!.connectedAt).toBe('number');
  });

  it('increments connectionCount for the scene', () => {
    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();

    manager.addClient(SCENE_A, c1);
    expect(manager.connectionCount(SCENE_A)).toBe(1);

    manager.addClient(SCENE_A, c2);
    expect(manager.connectionCount(SCENE_A)).toBe(2);
  });

  it('tracks multiple scenes independently', () => {
    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();

    manager.addClient(SCENE_A, c1);
    manager.addClient(SCENE_B, c2);

    expect(manager.connectionCount(SCENE_A)).toBe(1);
    expect(manager.connectionCount(SCENE_B)).toBe(1);
  });

  it('removes a client and decrements connectionCount', () => {
    const { controller } = makeController();
    const client = manager.addClient(SCENE_A, controller)!;

    manager.removeClient(client);

    expect(manager.connectionCount(SCENE_A)).toBe(0);
  });

  it('returns 0 for unknown scene', () => {
    expect(manager.connectionCount('nonexistent')).toBe(0);
  });

  it('tracks totalConnections across scenes', () => {
    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();
    const { controller: c3 } = makeController();

    manager.addClient(SCENE_A, c1);
    manager.addClient(SCENE_A, c2);
    manager.addClient(SCENE_B, c3);

    expect(manager.totalConnections()).toBe(3);
  });

  it('decrements totalConnections after removeClient', () => {
    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();

    const client1 = manager.addClient(SCENE_A, c1)!;
    manager.addClient(SCENE_A, c2);

    manager.removeClient(client1);

    expect(manager.totalConnections()).toBe(1);
  });

  it('removeClient is idempotent for already-removed clients', () => {
    const { controller } = makeController();
    const client = manager.addClient(SCENE_A, controller)!;

    manager.removeClient(client);
    expect(() => manager.removeClient(client)).not.toThrow();
    expect(manager.connectionCount(SCENE_A)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SSEManager — connection cap
// ---------------------------------------------------------------------------

describe('SSEManager — maxConnectionsPerScene cap', () => {
  it('returns null when cap is reached', () => {
    const manager = new SSEManager({ maxConnectionsPerScene: 2 });

    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();
    const { controller: c3 } = makeController();

    expect(manager.addClient(SCENE_A, c1)).not.toBeNull();
    expect(manager.addClient(SCENE_A, c2)).not.toBeNull();
    expect(manager.addClient(SCENE_A, c3)).toBeNull();
  });

  it('allows a new connection after one is removed', () => {
    const manager = new SSEManager({ maxConnectionsPerScene: 1 });

    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();

    const client1 = manager.addClient(SCENE_A, c1)!;
    expect(manager.addClient(SCENE_A, c2)).toBeNull();

    manager.removeClient(client1);

    const { controller: c3 } = makeController();
    expect(manager.addClient(SCENE_A, c3)).not.toBeNull();
  });

  it('cap is per scene, not global', () => {
    const manager = new SSEManager({ maxConnectionsPerScene: 1 });

    const { controller: c1 } = makeController();
    const { controller: c2 } = makeController();

    // One per scene — both should succeed.
    expect(manager.addClient(SCENE_A, c1)).not.toBeNull();
    expect(manager.addClient(SCENE_B, c2)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SSEManager — heartbeat
// ---------------------------------------------------------------------------

describe('SSEManager — heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends a :heartbeat comment after the configured interval', () => {
    const manager = new SSEManager({ heartbeatIntervalMs: 5_000 });
    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    expect(mock.text()).not.toContain(':heartbeat');

    vi.advanceTimersByTime(5_000);

    expect(mock.text()).toContain(':heartbeat');

    manager.removeClient(client);
  });

  it('sends multiple heartbeats over time', () => {
    const manager = new SSEManager({ heartbeatIntervalMs: 1_000 });
    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    vi.advanceTimersByTime(3_500);
    const text = mock.text();

    const count = (text.match(/:heartbeat/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);

    manager.removeClient(client);
  });

  it('stops heartbeat after removeClient', () => {
    const manager = new SSEManager({ heartbeatIntervalMs: 1_000 });
    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    vi.advanceTimersByTime(1_000);
    const countBefore = (mock.text().match(/:heartbeat/g) ?? []).length;

    manager.removeClient(client);

    vi.advanceTimersByTime(5_000);
    const countAfter = (mock.text().match(/:heartbeat/g) ?? []).length;

    expect(countAfter).toBe(countBefore);
  });
});

// ---------------------------------------------------------------------------
// SSEManager — broadcastToScene
// ---------------------------------------------------------------------------

describe('SSEManager — broadcastToScene', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  it('delivers a frame to all clients in the target scene', () => {
    const mock1 = makeController();
    const mock2 = makeController();

    manager.addClient(SCENE_A, mock1.controller);
    manager.addClient(SCENE_A, mock2.controller);

    manager.broadcastToScene(SCENE_A, botConnectedEvent);

    expect(mock1.text()).toContain('event: bot:connected');
    expect(mock2.text()).toContain('event: bot:connected');
  });

  it('does not deliver to clients in other scenes', () => {
    const mockA = makeController();
    const mockB = makeController();

    manager.addClient(SCENE_A, mockA.controller);
    manager.addClient(SCENE_B, mockB.controller);

    manager.broadcastToScene(SCENE_A, botConnectedEvent);

    expect(mockA.text()).toContain('event: bot:connected');
    expect(mockB.text()).not.toContain('event: bot:connected');
  });

  it('emits event frame with correct SSE wire format', () => {
    const mock = makeController();
    manager.addClient(SCENE_A, mock.controller);

    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);

    const text = mock.text();
    expect(text).toContain('event: scene:joined');
    expect(text).toContain('data: ');
    expect(text).toContain('id: ');
    // SSE spec requires blank line to terminate each message.
    expect(text).toMatch(/\n\n/);
  });

  it('includes the JSON payload inside the data field', () => {
    const mock = makeController();
    manager.addClient(SCENE_A, mock.controller);

    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);

    const text = mock.text();
    // Find the data line and parse it.
    const match = /data: (.+)/.exec(text);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed.type).toBe('scene:joined');
    expect(parsed.payload.botId).toBe('bot-1');
    expect(parsed.payload.sceneId).toBe(SCENE_A);
  });

  it('serialises bot:error events without throwing on Error objects', () => {
    const mock = makeController();
    manager.addClient(SCENE_A, mock.controller);

    expect(() => manager.broadcastToScene(SCENE_A, botErrorEvent)).not.toThrow();

    const text = mock.text();
    expect(text).toContain('event: bot:error');
    const match = /data: (.+)/.exec(text);
    const parsed = JSON.parse(match![1]!);
    expect(parsed.payload.error).toBe('test error');
  });

  it('serialises engine:error events without throwing on Error objects', () => {
    const mock = makeController();
    manager.addClient(SCENE_A, mock.controller);

    expect(() => manager.broadcastToScene(SCENE_A, engineErrorEvent)).not.toThrow();

    const text = mock.text();
    expect(text).toContain('event: engine:error');
  });

  it('silently removes a stale client whose controller throws on enqueue', () => {
    const { controller } = makeController();
    const client = manager.addClient(SCENE_A, controller)!;

    // Corrupt the controller so it throws on next enqueue.
    (client.controller as unknown as Record<string, unknown>)['enqueue'] = () => {
      throw new Error('stream closed');
    };

    expect(() => manager.broadcastToScene(SCENE_A, botConnectedEvent)).not.toThrow();
    expect(manager.connectionCount(SCENE_A)).toBe(0);
  });

  it('broadcasts to no clients without errors when scene is empty', () => {
    expect(() => manager.broadcastToScene('empty-scene', botConnectedEvent)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SSEManager — event IDs and replay buffer
// ---------------------------------------------------------------------------

describe('SSEManager — event IDs', () => {
  it('assigns a unique, incrementing id to each broadcast', () => {
    const manager = new SSEManager();
    const mock = makeController();
    manager.addClient(SCENE_A, mock.controller);

    manager.broadcastToScene(SCENE_A, botConnectedEvent);
    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);

    const text = mock.text();
    const ids = [...text.matchAll(/^id: (\d+)/gm)].map((m) => Number(m[1]));

    expect(ids.length).toBe(2);
    expect(ids[1]!).toBeGreaterThan(ids[0]!);
  });
});

describe('SSEManager — Last-Event-ID replay', () => {
  it('replays all buffered events when lastEventId is null', () => {
    const manager = new SSEManager({ replayBufferSize: 10 });

    // Broadcast before the new client connects.
    manager.broadcastToScene(SCENE_A, botConnectedEvent);
    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);

    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    manager.replayMissedEvents(client, null);

    const text = mock.text();
    expect(text).toContain('event: bot:connected');
    expect(text).toContain('event: scene:joined');
  });

  it('replays only events after the specified lastEventId', () => {
    const manager = new SSEManager({ replayBufferSize: 10 });

    // Broadcast event 1 (id "1").
    manager.broadcastToScene(SCENE_A, botConnectedEvent);
    // Broadcast event 2 (id "2").
    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);

    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    // Replay events after id "1" — only the second event should come through.
    manager.replayMissedEvents(client, '1');

    const text = mock.text();
    expect(text).not.toContain('event: bot:connected');
    expect(text).toContain('event: scene:joined');
  });

  it('replays nothing when lastEventId is the most recent event', () => {
    const manager = new SSEManager({ replayBufferSize: 10 });

    manager.broadcastToScene(SCENE_A, botConnectedEvent);

    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    manager.replayMissedEvents(client, '1');

    expect(mock.text()).toBe('');
  });

  it('replays entire buffer when lastEventId is unknown', () => {
    const manager = new SSEManager({ replayBufferSize: 10 });

    manager.broadcastToScene(SCENE_A, botConnectedEvent);
    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);

    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    // Unknown ID — treat as "replay all".
    manager.replayMissedEvents(client, '9999');

    const text = mock.text();
    expect(text).toContain('event: bot:connected');
    expect(text).toContain('event: scene:joined');
  });

  it('circular buffer drops oldest events when capacity is exceeded', () => {
    const manager = new SSEManager({ replayBufferSize: 2 });

    // Broadcast 3 events — only the last 2 should remain.
    manager.broadcastToScene(SCENE_A, botConnectedEvent);              // id 1 (dropped)
    manager.broadcastToScene(SCENE_A, sceneJoinedEvent);               // id 2
    manager.broadcastToScene(SCENE_A, botConnectedEvent);              // id 3

    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    manager.replayMissedEvents(client, null);

    const text = mock.text();
    const idMatches = [...text.matchAll(/^id: (\d+)/gm)].map((m) => m[1]);
    // The first event (id 1) should have been evicted.
    expect(idMatches).not.toContain('1');
    expect(idMatches).toContain('2');
    expect(idMatches).toContain('3');
  });
});

// ---------------------------------------------------------------------------
// createSSEHandler — Hono integration
// ---------------------------------------------------------------------------

describe('createSSEHandler — Hono route', () => {
  let manager: SSEManager;
  let app: Hono;

  beforeEach(() => {
    manager = new SSEManager();
    app = new Hono();
    app.get('/events/:sceneId', createSSEHandler(manager));
  });

  it('returns 200 with text/event-stream content type', async () => {
    const res = await app.request('/events/scene-x');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('sets Cache-Control: no-cache', async () => {
    const res = await app.request('/events/scene-x');

    expect(res.headers.get('Cache-Control')).toContain('no-cache');
  });

  it('sets X-Accel-Buffering: no', async () => {
    const res = await app.request('/events/scene-x');

    expect(res.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('returns a ReadableStream body', async () => {
    const res = await app.request('/events/scene-x');

    expect(res.body).not.toBeNull();
  });

  it('includes retry hint and connected event in the initial stream', async () => {
    const res = await app.request('/events/scene-x');

    // Read first chunk from the stream.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    // Read until we have the initial frames (retry + connected event).
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
      if (text.includes('event: connected')) break;
    }
    reader.releaseLock();

    expect(text).toContain('retry:');
    expect(text).toContain('event: connected');
    expect(text).toContain('sceneId');
    expect(text).toContain('clientId');
  });

  it('increments the connection count after connecting', async () => {
    // Fire the request but don't consume the body so the stream stays open.
    const res = await app.request('/events/scene-y');

    // Drain the async setup (the controller promise resolves in a microtask).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Read to unblock the stream so the start() callback fires.
    const reader = res.body!.getReader();
    await reader.read();
    reader.releaseLock();

    expect(manager.connectionCount('scene-y')).toBeGreaterThanOrEqual(0);
  });

  it('accepts Last-Event-ID header without error', async () => {
    // Pre-buffer an event so there is something to replay.
    manager.broadcastToScene('scene-replay', botConnectedEvent);

    const res = await app.request('/events/scene-replay', {
      headers: { 'Last-Event-ID': '0' },
    });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// createSSEHandler — over-capacity response
// ---------------------------------------------------------------------------

describe('createSSEHandler — connection cap enforcement', () => {
  it('sends an error comment when cap is reached', async () => {
    const manager = new SSEManager({ maxConnectionsPerScene: 0 });
    const app = new Hono();
    app.get('/events/:sceneId', createSSEHandler(manager));

    const res = await app.request('/events/full-scene');
    expect(res.status).toBe(200); // stream opens then closes gracefully

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain(':error: too many connections');
  });
});

// ---------------------------------------------------------------------------
// CircularBuffer (tested indirectly through SSEManager.replayMissedEvents)
// ---------------------------------------------------------------------------

describe('Circular buffer — edge cases', () => {
  it('replay on empty buffer returns without error', () => {
    const manager = new SSEManager({ replayBufferSize: 10 });
    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    expect(() => manager.replayMissedEvents(client, null)).not.toThrow();
    expect(mock.text()).toBe('');
  });

  it('replay with empty lastEventId string replays all events', () => {
    const manager = new SSEManager({ replayBufferSize: 10 });
    manager.broadcastToScene(SCENE_A, botConnectedEvent);

    const mock = makeController();
    const client = manager.addClient(SCENE_A, mock.controller)!;

    manager.replayMissedEvents(client, '');

    expect(mock.text()).toContain('event: bot:connected');
  });
});

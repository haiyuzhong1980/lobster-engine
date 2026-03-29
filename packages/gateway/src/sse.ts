// @lobster-engine/gateway — SSE (Server-Sent Events) service
//
// Provides a WebSocket-free push channel for environments that do not support
// WebSocket (e.g. WeChat Mini Programs).  Implements the W3C SSE wire format
// and supports:
//   - Per-scene client tracking with configurable connection cap
//   - Heartbeat comments to prevent proxy timeouts
//   - Last-Event-ID reconnection with a per-scene circular event buffer
//   - Broadcast from engine events to all connected SSE clients in a scene

import type { Context } from 'hono';
import type { EngineEvent } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SSEConfig {
  /** Interval in ms between `:heartbeat` comments. Default: 15 000. */
  readonly heartbeatIntervalMs?: number;
  /** Maximum simultaneous SSE connections per scene. Default: 200. */
  readonly maxConnectionsPerScene?: number;
  /** Client reconnect hint sent in the `retry:` field (ms). Default: 3 000. */
  readonly retryMs?: number;
  /** How many past events to keep per scene for Last-Event-ID replay. Default: 100. */
  readonly replayBufferSize?: number;
}

const DEFAULTS = {
  heartbeatIntervalMs: 15_000,
  maxConnectionsPerScene: 200,
  retryMs: 3_000,
  replayBufferSize: 100,
} as const satisfies Required<SSEConfig>;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface SSEClient {
  readonly id: string;
  readonly sceneId: string;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
  readonly connectedAt: number;
}

/** A single buffered event entry for Last-Event-ID replay. */
interface BufferedEvent {
  readonly eventId: string;
  readonly type: string;
  readonly data: string;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

/** Encode a string segment to Uint8Array. */
function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

/**
 * Build a complete SSE message frame:
 *   event: <type>\n
 *   id:    <eventId>\n
 *   data:  <json>\n
 *   \n
 *
 * Multi-line data values are split into multiple `data:` fields per spec.
 */
function buildEventFrame(type: string, data: string, eventId: string): Uint8Array {
  const lines: string[] = [];
  lines.push(`id: ${eventId}`);
  lines.push(`event: ${type}`);
  for (const line of data.split('\n')) {
    lines.push(`data: ${line}`);
  }
  lines.push('', ''); // trailing blank line
  return encode(lines.join('\n'));
}

/** A comment frame — keeps the connection alive without triggering `onmessage`. */
const HEARTBEAT_FRAME: Uint8Array = encode(':heartbeat\n\n');

// ---------------------------------------------------------------------------
// Circular event buffer
// ---------------------------------------------------------------------------

class CircularBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0;
  private _size = 0;

  constructor(private readonly capacity: number) {
    this.buf = new Array<T | undefined>(capacity).fill(undefined);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) {
      this._size += 1;
    }
  }

  /** Return all items in insertion order. */
  toArray(): T[] {
    if (this._size === 0) return [];
    if (this._size < this.capacity) {
      return this.buf.slice(0, this._size) as T[];
    }
    // Buffer is full — oldest item is at `head`.
    const tail = this.buf.slice(this.head) as T[];
    const front = this.buf.slice(0, this.head) as T[];
    return [...tail, ...front];
  }

  get size(): number {
    return this._size;
  }
}

// ---------------------------------------------------------------------------
// SSEManager
// ---------------------------------------------------------------------------

export class SSEManager {
  private readonly cfg: Required<SSEConfig>;

  /** sceneId → Set of connected clients */
  private readonly scenes = new Map<string, Set<SSEClient>>();

  /** sceneId → circular replay buffer */
  private readonly buffers = new Map<string, CircularBuffer<BufferedEvent>>();

  /** clientId → heartbeat interval handle */
  private readonly heartbeats = new Map<string, ReturnType<typeof setInterval>>();

  /** Monotonically increasing event sequence counter. */
  private eventSeq = 0;

  constructor(config: SSEConfig = {}) {
    this.cfg = {
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? DEFAULTS.heartbeatIntervalMs,
      maxConnectionsPerScene: config.maxConnectionsPerScene ?? DEFAULTS.maxConnectionsPerScene,
      retryMs: config.retryMs ?? DEFAULTS.retryMs,
      replayBufferSize: config.replayBufferSize ?? DEFAULTS.replayBufferSize,
    };
  }

  // --------------------------------------------------------------------------
  // Connection management
  // --------------------------------------------------------------------------

  /**
   * Register a new SSE client.  Returns `null` if the per-scene connection cap
   * has been reached.
   */
  addClient(
    sceneId: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): SSEClient | null {
    const existing = this.scenes.get(sceneId);
    const currentCount = existing?.size ?? 0;

    if (currentCount >= this.cfg.maxConnectionsPerScene) {
      return null;
    }

    const client: SSEClient = {
      id: crypto.randomUUID(),
      sceneId,
      controller,
      connectedAt: Date.now(),
    };

    if (existing === undefined) {
      this.scenes.set(sceneId, new Set([client]));
    } else {
      existing.add(client);
    }

    // Start heartbeat timer.
    const handle = setInterval(() => {
      this.sendRaw(client, HEARTBEAT_FRAME);
    }, this.cfg.heartbeatIntervalMs);
    this.heartbeats.set(client.id, handle);

    return client;
  }

  /** Remove a client and clean up its heartbeat timer. */
  removeClient(client: SSEClient): void {
    const handle = this.heartbeats.get(client.id);
    if (handle !== undefined) {
      clearInterval(handle);
      this.heartbeats.delete(client.id);
    }

    const set = this.scenes.get(client.sceneId);
    if (set !== undefined) {
      set.delete(client);
      if (set.size === 0) {
        this.scenes.delete(client.sceneId);
        // Prevent memory leak: drop the replay buffer when no clients remain.
        this.buffers.delete(client.sceneId);
      }
    }
  }

  /** Number of active connections in a scene. */
  connectionCount(sceneId: string): number {
    return this.scenes.get(sceneId)?.size ?? 0;
  }

  /** Total active connections across all scenes. */
  totalConnections(): number {
    let total = 0;
    for (const set of this.scenes.values()) {
      total += set.size;
    }
    return total;
  }

  // --------------------------------------------------------------------------
  // Broadcast
  // --------------------------------------------------------------------------

  /**
   * Broadcast an EngineEvent to all SSE clients subscribed to `sceneId`.
   * The event is also appended to the scene's replay buffer.
   */
  broadcastToScene(sceneId: string, event: EngineEvent): void {
    const eventId = this.nextEventId();
    const data = this.serializeEvent(event);
    const frame = buildEventFrame(event.type, data, eventId);

    // Buffer for replay.
    this.getBuffer(sceneId).push({ eventId, type: event.type, data });

    const clients = this.scenes.get(sceneId);
    if (clients === undefined || clients.size === 0) return;

    for (const client of clients) {
      this.sendRaw(client, frame);
    }
  }

  // --------------------------------------------------------------------------
  // Replay (Last-Event-ID)
  // --------------------------------------------------------------------------

  /**
   * Replay all events that occurred after `lastEventId` to the given client.
   * If `lastEventId` is empty/null the entire buffer is replayed.
   */
  replayMissedEvents(client: SSEClient, lastEventId: string | null): void {
    const buffered = this.getBuffer(client.sceneId).toArray();
    if (buffered.length === 0) return;

    let startIdx = 0;
    if (lastEventId !== null && lastEventId !== '') {
      const idx = buffered.findIndex((e) => e.eventId === lastEventId);
      if (idx !== -1) {
        startIdx = idx + 1; // replay everything AFTER the last seen event
      }
    }

    for (let i = startIdx; i < buffered.length; i++) {
      const entry = buffered[i]!;
      const frame = buildEventFrame(entry.type, entry.data, entry.eventId);
      this.sendRaw(client, frame);
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private sendRaw(client: SSEClient, frame: Uint8Array): void {
    try {
      client.controller.enqueue(frame);
    } catch {
      // Controller is closed — remove the stale client silently.
      this.removeClient(client);
    }
  }

  private nextEventId(): string {
    this.eventSeq += 1;
    return String(this.eventSeq);
  }

  private serializeEvent(event: EngineEvent): string {
    // `bot:error` and `engine:error` carry an Error object which is not
    // JSON-serialisable by default — convert to a plain string first.
    if (event.type === 'bot:error') {
      const safePayload = { botId: event.payload.botId, error: event.payload.error.message };
      return JSON.stringify({ type: event.type, payload: safePayload });
    }
    if (event.type === 'engine:error') {
      const safePayload = { error: event.payload.error.message };
      return JSON.stringify({ type: event.type, payload: safePayload });
    }
    return JSON.stringify(event);
  }

  private getBuffer(sceneId: string): CircularBuffer<BufferedEvent> {
    let buf = this.buffers.get(sceneId);
    if (buf === undefined) {
      buf = new CircularBuffer<BufferedEvent>(this.cfg.replayBufferSize);
      this.buffers.set(sceneId, buf);
    }
    return buf;
  }
}

// ---------------------------------------------------------------------------
// Hono route handler factory
// ---------------------------------------------------------------------------

/**
 * Create a Hono route handler for `GET /events/:sceneId`.
 *
 * Typical usage:
 * ```ts
 * const manager = new SSEManager();
 * app.get('/events/:sceneId', createSSEHandler(manager));
 * ```
 *
 * The `manager` instance should be shared with whatever emits engine events so
 * that `manager.broadcastToScene(sceneId, event)` can push updates to clients.
 */
export function createSSEHandler(
  manager: SSEManager,
  _config?: SSEConfig,
): (c: Context) => Response {
  return (c: Context): Response => {
    const sceneId = c.req.param('sceneId');
    if (!sceneId) {
      return new Response('Missing sceneId', { status: 400 });
    }

    const lastEventId = c.req.header('Last-Event-ID') ?? null;

    // Build a ReadableStream and hand the controller to SSEManager.
    let capturedClient: SSEClient | null = null;
    let resolveController!: (ctrl: ReadableStreamDefaultController<Uint8Array>) => void;
    const controllerPromise = new Promise<ReadableStreamDefaultController<Uint8Array>>(
      (res) => { resolveController = res; },
    );

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        resolveController(controller);
      },
      cancel() {
        if (capturedClient !== null) {
          manager.removeClient(capturedClient);
        }
      },
    });

    // Attach client asynchronously once the controller is available.
    void controllerPromise.then((controller) => {
      // Check connection cap.
      const client = manager.addClient(sceneId, controller);
      if (client === null) {
        // Over limit — close stream with a service-unavailable comment.
        try {
          controller.enqueue(encode(':error: too many connections\n\n'));
          controller.close();
        } catch {
          // already closed
        }
        return;
      }
      capturedClient = client;

      // Send the retry hint and connection event as the first frames.
      const retryMs = _config?.retryMs ?? DEFAULTS.retryMs;
      try {
        controller.enqueue(encode(`retry: ${retryMs}\n\n`));
        const connectedFrame = buildEventFrame(
          'connected',
          JSON.stringify({ sceneId, clientId: client.id }),
          '0',
        );
        controller.enqueue(connectedFrame);
      } catch {
        manager.removeClient(client);
        return;
      }

      // Replay any missed events if the client is reconnecting.
      manager.replayMissedEvents(client, lastEventId);
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  };
}

// @lobster-engine/gateway — WebSocket service

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { EngineEvent } from '@lobster-engine/core';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface WSConfig {
  readonly heartbeatIntervalMs?: number;       // default 30_000
  readonly maxConnectionsPerScene?: number;    // default 100
  readonly maxTotalConnections?: number;       // default 10_000
  readonly validateToken?: (token: string) => boolean | Promise<boolean>;
}

export interface WSClient {
  readonly id: string;
  readonly ws: WebSocket;
  readonly subscriptions: ReadonlySet<string>; // scene IDs
  readonly connectedAt: number;
  readonly lastPingAt: number;
}

// ---------------------------------------------------------------------------
// Wire message shapes
// ---------------------------------------------------------------------------

interface InboundMessage {
  readonly type: string;
  readonly sceneId?: string;
}

export interface OutboundMessage {
  readonly type: string;
  readonly data: unknown;
  readonly timestamp: number;
}

// ---------------------------------------------------------------------------
// Internal mutable client record (only WSManager mutates it)
// ---------------------------------------------------------------------------

interface MutableClient {
  readonly id: string;
  readonly ws: WebSocket;
  subscriptions: Set<string>;
  readonly connectedAt: number;
  lastPingAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMessage(type: string, data: unknown): string {
  const msg: OutboundMessage = { type, data, timestamp: Date.now() };
  return JSON.stringify(msg);
}

function parseInbound(raw: string): InboundMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('type' in parsed) ||
      typeof (parsed as Record<string, unknown>)['type'] !== 'string'
    ) {
      return null;
    }
    return parsed as InboundMessage;
  } catch {
    return null;
  }
}

function toReadonlyClient(c: MutableClient): WSClient {
  return {
    id: c.id,
    ws: c.ws,
    subscriptions: new Set(c.subscriptions),
    connectedAt: c.connectedAt,
    lastPingAt: c.lastPingAt,
  };
}

// ---------------------------------------------------------------------------
// WSManager
// ---------------------------------------------------------------------------

export class WSManager {
  private readonly clients = new Map<string, MutableClient>();
  private readonly sceneIndex = new Map<string, Set<string>>(); // sceneId → clientIds
  private readonly config: Required<
    Omit<WSConfig, 'validateToken'>
  > & { validateToken: WSConfig['validateToken'] };
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  constructor(config: WSConfig = {}) {
    this.config = {
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30_000,
      maxConnectionsPerScene: config.maxConnectionsPerScene ?? 100,
      maxTotalConnections: config.maxTotalConnections ?? 10_000,
      validateToken: config.validateToken,
    };
  }

  // --------------------------------------------------------------------------
  // Connection lifecycle
  // --------------------------------------------------------------------------

  /**
   * Register a newly opened WebSocket connection.
   * Returns the assigned client ID, or null if auth failed.
   */
  async addClient(ws: WebSocket, token?: string): Promise<string | null> {
    // Enforce global connection limit before authenticating.
    if (this.clients.size >= this.config.maxTotalConnections) {
      ws.close(1013, 'Server at capacity');
      return null;
    }

    if (token !== undefined && this.config.validateToken !== undefined) {
      const valid = await this.config.validateToken(token);
      if (!valid) {
        ws.close(1008, 'Unauthorized');
        return null;
      }
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const client: MutableClient = {
      id,
      ws,
      subscriptions: new Set(),
      connectedAt: now,
      lastPingAt: now,
    };

    this.clients.set(id, client);
    this._attachHandlers(id, ws);

    ws.send(buildMessage('connected', { clientId: id }));
    return id;
  }

  /** Remove a client and clean up all subscriptions. */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client === undefined) return;

    for (const sceneId of client.subscriptions) {
      this._removeFromSceneIndex(sceneId, clientId);
    }

    this.clients.delete(clientId);
  }

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  subscribe(clientId: string, sceneId: string): boolean {
    const client = this.clients.get(clientId);
    if (client === undefined) return false;

    const currentSize = this.sceneIndex.get(sceneId)?.size ?? 0;
    if (currentSize >= this.config.maxConnectionsPerScene) {
      client.ws.send(
        buildMessage('error', {
          code: 'SCENE_FULL',
          message: `Scene "${sceneId}" has reached the maximum connection limit`,
        }),
      );
      return false;
    }

    client.subscriptions.add(sceneId);

    if (!this.sceneIndex.has(sceneId)) {
      this.sceneIndex.set(sceneId, new Set());
    }
    this.sceneIndex.get(sceneId)!.add(clientId);

    client.ws.send(buildMessage('subscribed', { sceneId }));
    return true;
  }

  unsubscribe(clientId: string, sceneId: string): void {
    const client = this.clients.get(clientId);
    if (client === undefined) return;

    client.subscriptions.delete(sceneId);
    this._removeFromSceneIndex(sceneId, clientId);
    client.ws.send(buildMessage('unsubscribed', { sceneId }));
  }

  // --------------------------------------------------------------------------
  // Broadcasting
  // --------------------------------------------------------------------------

  /** Broadcast an EngineEvent to all clients subscribed to a scene. */
  broadcastToScene(sceneId: string, event: EngineEvent): void {
    const clientIds = this.sceneIndex.get(sceneId);
    if (clientIds === undefined || clientIds.size === 0) return;

    const payload = buildMessage('event', event);

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client === undefined) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  /** Broadcast a raw message to all clients subscribed to a scene. */
  broadcastRawToScene(sceneId: string, type: string, data: unknown): void {
    const clientIds = this.sceneIndex.get(sceneId);
    if (clientIds === undefined || clientIds.size === 0) return;

    const payload = buildMessage(type, data);

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client === undefined) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Heartbeat
  // --------------------------------------------------------------------------

  startHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) return;

    this.heartbeatTimer = setInterval(() => {
      const staleThreshold = Date.now() - this.config.heartbeatIntervalMs * 2;

      for (const [clientId, client] of this.clients) {
        if (client.ws.readyState !== WebSocket.OPEN) {
          this.removeClient(clientId);
          continue;
        }

        if (client.lastPingAt < staleThreshold) {
          // Stale — no pong received for two full intervals
          client.ws.close(1001, 'Heartbeat timeout');
          this.removeClient(clientId);
          continue;
        }

        // Use protocol-level ping (RFC 6455 opcode 0x9) so the browser/client
        // responds with a protocol-level pong (opcode 0xA).  The 'pong' event
        // listener on each socket updates lastPingAt.  Application-level JSON
        // ping messages are intentionally omitted to avoid ambiguity.
        client.ws.ping();
      }
    }, this.config.heartbeatIntervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  // --------------------------------------------------------------------------
  // Inspection
  // --------------------------------------------------------------------------

  getClient(clientId: string): WSClient | undefined {
    const c = this.clients.get(clientId);
    return c !== undefined ? toReadonlyClient(c) : undefined;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSceneClientCount(sceneId: string): number {
    return this.sceneIndex.get(sceneId)?.size ?? 0;
  }

  getAllClients(): readonly WSClient[] {
    return Array.from(this.clients.values()).map(toReadonlyClient);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _attachHandlers(clientId: string, ws: WebSocket): void {
    ws.on('message', (raw) => {
      this._handleMessage(clientId, raw.toString());
    });

    ws.on('close', () => {
      this.removeClient(clientId);
    });

    ws.on('error', () => {
      this.removeClient(clientId);
    });

    // Track pong responses to update lastPingAt
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client !== undefined) {
        client.lastPingAt = Date.now();
      }
    });
  }

  private _handleMessage(clientId: string, raw: string): void {
    const client = this.clients.get(clientId);
    if (client === undefined) return;

    const msg = parseInbound(raw);
    if (msg === null) {
      client.ws.send(
        buildMessage('error', { code: 'INVALID_MESSAGE', message: 'Malformed JSON message' }),
      );
      return;
    }

    switch (msg.type) {
      case 'subscribe': {
        if (typeof msg.sceneId !== 'string') {
          client.ws.send(
            buildMessage('error', { code: 'MISSING_SCENE_ID', message: 'sceneId is required' }),
          );
          return;
        }
        this.subscribe(clientId, msg.sceneId);
        break;
      }

      case 'unsubscribe': {
        if (typeof msg.sceneId !== 'string') {
          client.ws.send(
            buildMessage('error', { code: 'MISSING_SCENE_ID', message: 'sceneId is required' }),
          );
          return;
        }
        this.unsubscribe(clientId, msg.sceneId);
        break;
      }

      case 'pong': {
        // Client-initiated pong — update lastPingAt
        client.lastPingAt = Date.now();
        break;
      }

      default: {
        client.ws.send(
          buildMessage('error', {
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: "${msg.type}"`,
          }),
        );
      }
    }
  }

  private _removeFromSceneIndex(sceneId: string, clientId: string): void {
    const set = this.sceneIndex.get(sceneId);
    if (set === undefined) return;
    set.delete(clientId);
    if (set.size === 0) {
      this.sceneIndex.delete(sceneId);
    }
  }
}

// ---------------------------------------------------------------------------
// createWSHandler — Node.js HTTP upgrade handler factory
// ---------------------------------------------------------------------------

/**
 * Returns a Node.js HTTP upgrade handler (`server.on('upgrade', handler)`)
 * that accepts WebSocket connections, performs optional token auth, and
 * delegates to a WSManager instance.
 *
 * Token resolution order (most secure first):
 *   1. `Sec-WebSocket-Protocol` header — preferred; token never appears in
 *      server logs or browser history.
 *   2. `?token=` URL query parameter — accepted for backwards compatibility
 *      but DEPRECATED; tokens in URLs are logged by proxies and stored in
 *      browser history.
 *
 * Usage:
 * ```ts
 * const manager = new WSManager(config);
 * const handler = createWSHandler(manager);
 * httpServer.on('upgrade', handler);
 * manager.startHeartbeat();
 * ```
 */
// HIGH-06: Maximum WebSocket message payload — 64 KB
const WS_MAX_PAYLOAD = 64 * 1024;

export function createWSHandler(
  manager: WSManager,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD });

  return (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Prefer token from Sec-WebSocket-Protocol subprotocol header (not logged).
    const protocolToken = req.headers['sec-websocket-protocol'];
    // DEPRECATED: token in URL query param appears in server logs and browser
    // history.  Kept only for backwards compatibility.
    const queryToken = url.searchParams.get('token');
    const token = (protocolToken ?? queryToken) ?? undefined;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
      void manager.addClient(ws, token);
    });
  };
}

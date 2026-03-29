// @lobster-engine/core — NATS client wrapper

import {
  connect,
  JSONCodec,
  Events,
  type NatsConnection,
  type Subscription,
  type Status,
} from 'nats';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NatsClientOptions {
  /** One or more NATS server URLs, e.g. ["nats://localhost:4222"] */
  readonly servers: string[];
  /** Optional client name shown in the server's connection list. */
  readonly name?: string;
  /** Optional authentication token. */
  readonly token?: string;
  /** Maximum reconnect attempts (-1 = unlimited). Defaults to 10. */
  readonly maxReconnectAttempts?: number;
}

/**
 * Alias for {@link NatsClientOptions}.
 * Kept for back-compat with consumers that reference `NatsConfig`.
 */
export type NatsConfig = NatsClientOptions;

/** Handler called for every message received on a subject. */
export type MessageHandler = (data: unknown) => Promise<void>;

export interface SubscriptionHandle {
  unsubscribe(): void;
}

export interface NatsHealthInfo {
  connected: boolean;
  /** Server host:port string, or empty string when disconnected. */
  server: string;
  /** Round-trip time in milliseconds, only present when connected. */
  rtt?: number;
}

// ---------------------------------------------------------------------------
// NatsClient
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the official `nats` npm package that:
 * - Encodes/decodes message payloads as JSON.
 * - Exposes synchronous publish and promise-based request/reply.
 * - Supports both regular and queue-group subscriptions.
 * - Handles reconnection events and graceful drain/shutdown.
 */
export class NatsClient {
  private connection: NatsConnection | undefined = undefined;
  private readonly codec = JSONCodec<unknown>();
  /** Background status-loop cancellation handle. */
  private statusLoopAbort: (() => void) | undefined = undefined;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Establish a connection to the NATS server(s).
   * Idempotent — calling connect() when already connected is a no-op.
   */
  async connect(opts: NatsClientOptions): Promise<void> {
    if (this.connection !== undefined) return;

    this.connection = await connect({
      servers: opts.servers,
      name: opts.name,
      token: opts.token,
      maxReconnectAttempts: opts.maxReconnectAttempts ?? 10,
    });

    this.watchStatus(this.connection);
  }

  /**
   * Gracefully drain all pending messages and close the connection.
   * Idempotent — safe to call when already disconnected.
   */
  async disconnect(): Promise<void> {
    if (this.connection === undefined) return;
    const conn = this.connection;
    this.connection = undefined;
    this.stopStatusWatch();
    await conn.drain();
  }

  /** Returns true when the underlying NATS connection is open and not draining. */
  isConnected(): boolean {
    if (this.connection === undefined) return false;
    return !this.connection.isClosed() && !this.connection.isDraining();
  }

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  /**
   * Publish a message to `subject`. The payload is JSON-encoded.
   * Throws if not connected.
   */
  publish(subject: string, data: unknown): void {
    const conn = this.requireConnection();
    conn.publish(subject, this.encode(data));
  }

  // -------------------------------------------------------------------------
  // Subscribe
  // -------------------------------------------------------------------------

  /**
   * Subscribe to `subject`. Returns a handle that can be used to cancel the
   * subscription. Messages are delivered to `handler` asynchronously; errors
   * thrown by the handler are swallowed to keep the subscription loop alive —
   * callers must handle their own errors inside the handler.
   */
  subscribe(subject: string, handler: MessageHandler): SubscriptionHandle {
    const conn = this.requireConnection();
    const sub = conn.subscribe(subject);
    this.drainSubscription(sub, subject, handler);
    return { unsubscribe: () => sub.unsubscribe() };
  }

  // -------------------------------------------------------------------------
  // Request / reply
  // -------------------------------------------------------------------------

  /**
   * Send a request to `subject` and wait for a single reply.
   * Returns the decoded response payload.
   */
  async request(subject: string, data: unknown, timeout = 5_000): Promise<unknown> {
    const conn = this.requireConnection();
    const msg = await conn.request(subject, this.encode(data), { timeout });
    return this.decode(msg.data);
  }

  // -------------------------------------------------------------------------
  // Queue groups
  // -------------------------------------------------------------------------

  /**
   * Subscribe to `subject` using a NATS queue group named `queue`.
   * Within a queue group, each message is delivered to exactly one subscriber
   * (load-balancing). Useful for horizontal worker scaling.
   */
  queueSubscribe(
    subject: string,
    queue: string,
    handler: MessageHandler,
  ): SubscriptionHandle {
    const conn = this.requireConnection();
    const sub = conn.subscribe(subject, { queue });
    this.drainSubscription(sub, subject, handler);
    return { unsubscribe: () => sub.unsubscribe() };
  }

  // -------------------------------------------------------------------------
  // Drain (graceful shutdown)
  // -------------------------------------------------------------------------

  /**
   * Drain all pending messages from every subscription and flush outbound
   * messages, then close the connection. This is the graceful-shutdown path.
   * After drain() returns, the client is disconnected.
   */
  async drain(): Promise<void> {
    if (this.connection === undefined) return;
    const conn = this.connection;
    this.connection = undefined;
    this.stopStatusWatch();
    await conn.drain();
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * Returns a snapshot of the current connection health.
   * `rtt` is resolved asynchronously; use a separate `rtt()` call on the
   * underlying connection when you need a live measurement.
   */
  health(): NatsHealthInfo {
    if (this.connection === undefined || this.connection.isClosed()) {
      return { connected: false, server: '' };
    }
    return {
      connected: !this.connection.isDraining(),
      server: this.connection.getServer(),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Expose the underlying NatsConnection for integrations (e.g. JetStream)
   * that need direct access to the raw connection object.
   * Returns `undefined` when not connected.
   */
  getRawConnection(): unknown {
    return this.connection;
  }

  private requireConnection(): NatsConnection {
    if (this.connection === undefined) {
      throw new Error(
        'NatsClient is not connected. Call connect() before using publish/subscribe.',
      );
    }
    return this.connection;
  }

  private encode(data: unknown): Uint8Array {
    return this.codec.encode(data);
  }

  private decode(bytes: Uint8Array): unknown {
    try {
      return this.codec.decode(bytes);
    } catch {
      // Fall back to raw string if JSON decoding fails.
      return new TextDecoder().decode(bytes);
    }
  }

  /**
   * Processes an async subscription iterator in a detached background loop.
   * Handler errors are logged and the loop continues until the subscription is
   * closed or the connection is drained.
   */
  private drainSubscription(sub: Subscription, subject: string, handler: MessageHandler): void {
    void (async () => {
      for await (const msg of sub) {
        const data = this.decode(msg.data);
        try {
          await handler(data);
        } catch (handlerErr: unknown) {
          const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
          console.error(`[NatsClient] subscription handler error on ${subject}: ${errMsg}`);
        }
      }
    })();
  }

  /**
   * Starts a background loop that monitors connection status events
   * (disconnect / reconnect). This is informational; reconnection itself is
   * handled transparently by the nats.js library.
   */
  private watchStatus(conn: NatsConnection): void {
    let cancelled = false;
    this.statusLoopAbort = () => {
      cancelled = true;
    };

    void (async () => {
      const iter: AsyncIterable<Status> = conn.status();
      for await (const status of iter) {
        if (cancelled) break;
        if (status.type === Events.Disconnect) {
          // Connection lost; the library will attempt to reconnect automatically.
        } else if (status.type === Events.Reconnect) {
          // Connection restored.
        }
      }
    })();
  }

  private stopStatusWatch(): void {
    if (this.statusLoopAbort !== undefined) {
      this.statusLoopAbort();
      this.statusLoopAbort = undefined;
    }
  }
}

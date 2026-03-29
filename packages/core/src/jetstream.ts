// @lobster-engine/core — JetStream persistent messaging manager

import {
  JSONCodec,
  nanos,
  consumerOpts,
  DiscardPolicy,
  RetentionPolicy,
  StorageType,
  type JetStreamClient,
  type JetStreamManager as NatsJetStreamManager,
  type JsMsg,
  type StreamInfo as NatsStreamInfo,
} from 'nats';

import type { NatsClient } from './nats.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface JetStreamConfig {
  /** Enable JetStream. When false, initialize() is a no-op. */
  enabled: boolean;
  /** Stream name. Default: 'LOBSTER'. */
  streamName?: string;
  /** Subjects captured by the stream. Default: ['bot.>', 'scene.>', 'worker.>', 'system.>']. */
  subjects?: string[];
  /** Message retention in milliseconds. Default: 86_400_000 (24 h). */
  maxAge?: number;
  /** Maximum stream size in bytes. Default: 1_073_741_824 (1 GB). */
  maxBytes?: number;
  /** Number of stream replicas. Default: 1. */
  replicas?: number;
  /** Storage backend. Default: 'file'. */
  storage?: 'memory' | 'file';
}

export interface MessageMeta {
  /** JetStream sequence number. */
  seq: number;
  /** Server-assigned message timestamp. */
  timestamp: Date;
  /** The subject the message was published to. */
  subject: string;
  /** True when this is not the first delivery attempt. */
  redelivered: boolean;
  /** Number of times this message has been redelivered. */
  redeliveryCount: number;
}

export interface JetStreamSubscription {
  unsubscribe(): void;
}

export interface PullSubscription {
  /**
   * Fetch up to `batchSize` messages. Each item provides decoded data,
   * message metadata, and an `ack` callback. Call `ack()` once a message
   * has been processed successfully so the server will not redeliver it.
   */
  fetch(
    batchSize?: number,
  ): Promise<Array<{ data: unknown; meta: MessageMeta; ack: () => void }>>;
  unsubscribe(): void;
}

export interface StreamInfo {
  name: string;
  subjects: string[];
  messages: number;
  bytes: number;
  firstSeq: number;
  lastSeq: number;
  consumerCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_STREAM_NAME = 'LOBSTER';
const DEFAULT_SUBJECTS = ['bot.>', 'scene.>', 'worker.>', 'system.>'];
const DEFAULT_MAX_AGE_MS = 86_400_000; // 24 h
const DEFAULT_MAX_BYTES = 1_073_741_824; // 1 GB
const DEFAULT_REPLICAS = 1;
/** Back-off delay (ms) applied to redelivery after a handler error. */
const NAK_DELAY_MS = 5_000;
/** Maximum in-flight unacknowledged messages per push consumer. */
const MAX_ACK_PENDING = 256;
/** Maximum redelivery count before a message is permanently terminated. */
const MAX_REDELIVERIES = 5;
/** Fetch timeout in milliseconds for pull consumers. */
const PULL_FETCH_EXPIRES_MS = 5_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toStreamInfo(raw: NatsStreamInfo): StreamInfo {
  return {
    name: raw.config.name,
    subjects: raw.config.subjects ?? [],
    messages: raw.state.messages,
    bytes: raw.state.bytes,
    firstSeq: raw.state['first_seq'],
    lastSeq: raw.state['last_seq'],
    consumerCount: raw.state['consumer_count'],
  };
}

function extractMeta(msg: JsMsg): MessageMeta {
  return {
    seq: msg.seq,
    timestamp: new Date(msg.info.timestampNanos / 1_000_000),
    subject: msg.subject,
    redelivered: msg.redelivered,
    redeliveryCount: msg.info.redeliveryCount,
  };
}

// ---------------------------------------------------------------------------
// JetStreamManager
// ---------------------------------------------------------------------------

/**
 * Manages a single NATS JetStream stream with durable consumer support.
 *
 * Lifecycle:
 * 1. Construct with a connected {@link NatsClient} and a {@link JetStreamConfig}.
 * 2. Call `initialize()` once to create or update the stream.
 * 3. Use `publish()`, `subscribe()`, and `pullSubscribe()` as needed.
 * 4. Call `destroy()` on shutdown.
 */
export class JetStreamManager {
  private readonly streamName: string;
  private readonly streamSubjects: string[];
  private readonly maxAgeMs: number;
  private readonly maxBytes: number;
  private readonly replicas: number;
  private readonly storageType: StorageType;

  private jsClient: JetStreamClient | undefined = undefined;
  private jsmClient: NatsJetStreamManager | undefined = undefined;
  private readonly codec = JSONCodec<unknown>();

  constructor(
    private readonly nats: NatsClient,
    private readonly config: JetStreamConfig,
  ) {
    this.streamName = config.streamName ?? DEFAULT_STREAM_NAME;
    this.streamSubjects = config.subjects ?? DEFAULT_SUBJECTS;
    this.maxAgeMs = config.maxAge ?? DEFAULT_MAX_AGE_MS;
    this.maxBytes = config.maxBytes ?? DEFAULT_MAX_BYTES;
    this.replicas = config.replicas ?? DEFAULT_REPLICAS;
    this.storageType =
      config.storage === 'memory' ? StorageType.Memory : StorageType.File;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create or update the JetStream stream.
   * Idempotent — safe to call on every startup.
   * When `config.enabled` is false this method is a no-op.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) return;

    const conn = this.requireRawConnection();
    this.jsClient = conn.jetstream();
    this.jsmClient = await conn.jetstreamManager();

    await this.ensureStream();
  }

  /** Release internal references to JetStream handles. */
  async destroy(): Promise<void> {
    this.jsClient = undefined;
    this.jsmClient = undefined;
  }

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  /**
   * Publish `data` to `subject` with at-least-once delivery guarantee.
   * Returns the server-assigned sequence number and stream name.
   * Throws when not initialized.
   */
  async publish(
    subject: string,
    data: unknown,
  ): Promise<{ seq: number; stream: string }> {
    const js = this.requireJs();
    const encoded = this.codec.encode(data);
    const ack = await js.publish(subject, encoded);
    return { seq: ack.seq, stream: ack.stream };
  }

  // -------------------------------------------------------------------------
  // Push (durable) subscribe
  // -------------------------------------------------------------------------

  /**
   * Subscribe using a durable push consumer.
   * The consumer resumes from the last acknowledged sequence on restart.
   *
   * Handler contract:
   * - Return normally → message is acknowledged.
   * - Throw → message is nacked with a {@link NAK_DELAY_MS} delay for
   *   redelivery.
   * - After {@link MAX_REDELIVERIES} attempts the message is terminated.
   */
  async subscribe(
    subject: string,
    durableName: string,
    handler: (data: unknown, meta: MessageMeta) => Promise<void>,
  ): Promise<JetStreamSubscription> {
    const js = this.requireJs();

    const opts = consumerOpts();
    opts.durable(durableName);
    opts.deliverAll();
    opts.ackExplicit();
    opts.filterSubject(subject);
    opts.maxAckPending(MAX_ACK_PENDING);
    opts.manualAck();
    opts.deliverTo(`_lobster_push_${durableName}`);

    const sub = await js.subscribe(subject, opts);

    void this.drainPushSubscription(sub, handler);

    return {
      unsubscribe: () => {
        sub.unsubscribe();
      },
    };
  }

  // -------------------------------------------------------------------------
  // Pull (durable) subscribe
  // -------------------------------------------------------------------------

  /**
   * Create a pull-based durable consumer for batch processing.
   * Call `PullSubscription.fetch()` to retrieve messages on demand.
   */
  async pullSubscribe(
    subject: string,
    durableName: string,
    batchSize: number,
  ): Promise<PullSubscription> {
    const js = this.requireJs();

    const opts = consumerOpts();
    opts.durable(durableName);
    opts.deliverAll();
    opts.ackExplicit();
    opts.filterSubject(subject);
    opts.manualAck();

    const pullSub = await js.pullSubscribe(subject, opts);

    return {
      fetch: async (size?: number) => this.fetchBatch(pullSub, size ?? batchSize),
      unsubscribe: () => {
        pullSub.unsubscribe();
      },
    };
  }

  // -------------------------------------------------------------------------
  // Stream info
  // -------------------------------------------------------------------------

  /** Return a snapshot of current stream statistics. */
  async streamInfo(): Promise<StreamInfo> {
    const jsm = this.requireJsm();
    const raw = await jsm.streams.info(this.streamName);
    return toStreamInfo(raw);
  }

  // -------------------------------------------------------------------------
  // Purge
  // -------------------------------------------------------------------------

  /**
   * Purge messages from the stream.
   *
   * When `olderThan` (ms) is provided, only messages older than that
   * relative age are removed — achieved by purging up to the last sequence
   * whose timestamp predates `now - olderThan`. Without `olderThan` all
   * messages are purged.
   *
   * Returns the count of purged messages.
   */
  async purge(olderThan?: number): Promise<number> {
    const jsm = this.requireJsm();

    if (olderThan !== undefined) {
      // Determine the cut-off sequence: find the last message whose
      // server timestamp is before (now - olderThan). We purge everything
      // up to and including that sequence.
      const info = await jsm.streams.info(this.streamName);
      const cutoffMs = Date.now() - olderThan;
      const lastSeq = info.state['last_seq'];
      const firstSeq = info.state['first_seq'];

      if (firstSeq === 0 || lastSeq === 0) {
        // Empty stream.
        return 0;
      }

      // Walk backwards from lastSeq to find the boundary.
      // For streams with moderate message counts this is acceptable;
      // high-volume streams should use TTL-based stream retention instead.
      let cutoffSeq = 0;
      for (let seq = firstSeq; seq <= lastSeq; seq++) {
        try {
          const msg = await jsm.streams.getMessage(this.streamName, { seq });
          // StoredMsg.timestamp is an ISO string — parse to ms.
          const msgTs = new Date(msg.timestamp).getTime();
          if (msgTs < cutoffMs) {
            cutoffSeq = seq;
          } else {
            break;
          }
        } catch {
          // Message deleted or gap — continue.
        }
      }

      if (cutoffSeq === 0) return 0;

      const response = await jsm.streams.purge(this.streamName, {
        seq: cutoffSeq + 1,
      });
      return response.purged;
    }

    const response = await jsm.streams.purge(this.streamName);
    return response.purged;
  }

  // -------------------------------------------------------------------------
  // Private — stream provisioning
  // -------------------------------------------------------------------------

  private async ensureStream(): Promise<void> {
    const jsm = this.requireJsm();

    const streamCfg = {
      name: this.streamName,
      subjects: this.streamSubjects,
      retention: RetentionPolicy.Limits,
      storage: this.storageType,
      num_replicas: this.replicas,
      max_age: nanos(this.maxAgeMs),
      max_bytes: this.maxBytes,
      max_msgs: -1 as number,
      max_msg_size: -1 as number,
      max_consumers: -1 as number,
      max_msgs_per_subject: -1 as number,
      discard: DiscardPolicy.Old,
      discard_new_per_subject: false,
      allow_rollup_hdrs: false,
      duplicate_window: nanos(120_000),
      sealed: false,
      first_seq: 0,
    };

    try {
      await jsm.streams.info(this.streamName);
      // Stream exists — reconcile config drift.
      await jsm.streams.update(this.streamName, streamCfg);
    } catch {
      // Stream does not yet exist.
      await jsm.streams.add(streamCfg);
    }
  }

  // -------------------------------------------------------------------------
  // Private — push consumer drain loop
  // -------------------------------------------------------------------------

  private async drainPushSubscription(
    sub: Awaited<ReturnType<JetStreamClient['subscribe']>>,
    handler: (data: unknown, meta: MessageMeta) => Promise<void>,
  ): Promise<void> {
    for await (const msg of sub) {
      const meta = extractMeta(msg);

      if (meta.redeliveryCount >= MAX_REDELIVERIES) {
        msg.term('max redeliveries exceeded');
        continue;
      }

      try {
        const data = this.decodePayload(msg.data);
        await handler(data, meta);
        msg.ack();
      } catch {
        msg.nak(NAK_DELAY_MS);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private — pull fetch
  // -------------------------------------------------------------------------

  private async fetchBatch(
    pullSub: Awaited<ReturnType<JetStreamClient['pullSubscribe']>>,
    batchSize: number,
  ): Promise<Array<{ data: unknown; meta: MessageMeta; ack: () => void }>> {
    pullSub.pull({ batch: batchSize, expires: PULL_FETCH_EXPIRES_MS });

    const results: Array<{ data: unknown; meta: MessageMeta; ack: () => void }> = [];
    const deadline = Date.now() + PULL_FETCH_EXPIRES_MS + 500;

    for await (const msg of pullSub) {
      const decoded = this.decodePayload(msg.data);
      const meta = extractMeta(msg);
      const captured: JsMsg = msg;
      results.push({ data: decoded, meta, ack: () => captured.ack() });
      if (results.length >= batchSize || Date.now() > deadline) break;
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Private — codec
  // -------------------------------------------------------------------------

  private decodePayload(bytes: Uint8Array): unknown {
    try {
      return this.codec.decode(bytes);
    } catch {
      return new TextDecoder().decode(bytes);
    }
  }

  // -------------------------------------------------------------------------
  // Private — guards
  // -------------------------------------------------------------------------

  private requireRawConnection(): RawNatsConnection {
    const raw = this.nats.getRawConnection() as RawNatsConnection | undefined;
    if (raw === undefined) {
      throw new Error(
        'JetStreamManager: NatsClient is not connected. Call NatsClient.connect() first.',
      );
    }
    return raw;
  }

  private requireJs(): JetStreamClient {
    if (this.jsClient === undefined) {
      throw new Error(
        'JetStreamManager: not initialized. Call initialize() first.',
      );
    }
    return this.jsClient;
  }

  private requireJsm(): NatsJetStreamManager {
    if (this.jsmClient === undefined) {
      throw new Error(
        'JetStreamManager: not initialized. Call initialize() first.',
      );
    }
    return this.jsmClient;
  }
}

// ---------------------------------------------------------------------------
// Private interface — raw NatsConnection surface we need
// ---------------------------------------------------------------------------

interface RawNatsConnection {
  jetstream(): JetStreamClient;
  jetstreamManager(): Promise<NatsJetStreamManager>;
}

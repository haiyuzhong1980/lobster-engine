// @lobster-engine/core — JetStreamManager unit tests
//
// All NATS JetStream calls are mocked; no real NATS server is required.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as natsModule from 'nats';
import { JetStreamManager } from '../jetstream.js';
import type { JetStreamConfig } from '../jetstream.js';
import type { NatsClient } from '../nats.js';

// ---------------------------------------------------------------------------
// Mock nats module
// ---------------------------------------------------------------------------

vi.mock('nats', async (importOriginal) => {
  const actual = await importOriginal<typeof natsModule>();
  return {
    ...actual,
    // Keep real JSONCodec so encode/decode works
    JSONCodec: actual.JSONCodec,
    nanos: actual.nanos,
    RetentionPolicy: actual.RetentionPolicy,
    StorageType: actual.StorageType,
    consumerOpts: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers — mock JetStream surface
// ---------------------------------------------------------------------------

interface MockConsumerOpts {
  durable: ReturnType<typeof vi.fn>;
  deliverAll: ReturnType<typeof vi.fn>;
  ackExplicit: ReturnType<typeof vi.fn>;
  filterSubject: ReturnType<typeof vi.fn>;
  maxAckPending: ReturnType<typeof vi.fn>;
  manualAck: ReturnType<typeof vi.fn>;
  deliverTo: ReturnType<typeof vi.fn>;
}

function makeMockConsumerOpts(): MockConsumerOpts {
  return {
    durable: vi.fn(),
    deliverAll: vi.fn(),
    ackExplicit: vi.fn(),
    filterSubject: vi.fn(),
    maxAckPending: vi.fn(),
    manualAck: vi.fn(),
    deliverTo: vi.fn(),
  };
}

interface MockJsMsg {
  seq: number;
  subject: string;
  data: Uint8Array;
  redelivered: boolean;
  info: { timestampNanos: number; redeliveryCount: number };
  ack: ReturnType<typeof vi.fn>;
  nak: ReturnType<typeof vi.fn>;
  term: ReturnType<typeof vi.fn>;
}

function makeMockJsMsg(overrides: Partial<MockJsMsg> = {}): MockJsMsg {
  return {
    seq: 1,
    subject: 'bot.bot-1.event',
    data: natsModule.JSONCodec<unknown>().encode({ type: 'turn_start' }),
    redelivered: false,
    info: { timestampNanos: Date.now() * 1_000_000, redeliveryCount: 0 },
    ack: vi.fn(),
    nak: vi.fn(),
    term: vi.fn(),
    ...overrides,
  };
}

// A push subscription that delivers messages from an internal queue.
function makePushSub(messages: MockJsMsg[] = []) {
  let done = false;
  const pending = [...messages];
  const waiters: Array<(v: IteratorResult<MockJsMsg>) => void> = [];

  const sub = {
    unsubscribe: vi.fn(() => {
      done = true;
      for (const resolve of waiters.splice(0)) {
        resolve({ value: undefined as unknown as MockJsMsg, done: true });
      }
    }),
    push(msg: MockJsMsg): void {
      const resolve = waiters.shift();
      if (resolve !== undefined) {
        resolve({ value: msg, done: false });
      } else {
        pending.push(msg);
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<MockJsMsg>> {
          if (done && pending.length === 0) {
            return Promise.resolve({ value: undefined as unknown as MockJsMsg, done: true });
          }
          const buffered = pending.shift();
          if (buffered !== undefined) {
            return Promise.resolve({ value: buffered, done: false });
          }
          return new Promise<IteratorResult<MockJsMsg>>((resolve) => waiters.push(resolve));
        },
      };
    },
  };
  return sub;
}

// A pull subscription that collects fetch() calls.
function makePullSub(batches: MockJsMsg[][] = []) {
  const allMessages = batches.flat();
  let callCount = 0;

  const sub = {
    unsubscribe: vi.fn(),
    pull: vi.fn(),
    [Symbol.asyncIterator]() {
      let idx = 0;
      return {
        next(): Promise<IteratorResult<MockJsMsg>> {
          if (idx < allMessages.length) {
            return Promise.resolve({ value: allMessages[idx++] as MockJsMsg, done: false });
          }
          callCount++;
          return new Promise(() => {
            // Never resolves — simulates timeout
          });
        },
      };
    },
  };
  return sub;
}

interface MockJsClient {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  pullSubscribe: ReturnType<typeof vi.fn>;
}

interface MockJsmClient {
  streams: {
    info: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    purge: ReturnType<typeof vi.fn>;
    getMessage: ReturnType<typeof vi.fn>;
  };
}

function makeStreamInfo(overrides: Record<string, unknown> = {}) {
  return {
    config: {
      name: 'LOBSTER',
      subjects: ['bot.>', 'scene.>', 'worker.>', 'system.>'],
    },
    state: {
      messages: 100,
      bytes: 1_024,
      first_seq: 1,
      last_seq: 100,
      consumer_count: 2,
    },
    ...overrides,
  };
}

function makeJsClient(overrides: Partial<MockJsClient> = {}): MockJsClient {
  return {
    publish: vi.fn().mockResolvedValue({ seq: 1, stream: 'LOBSTER' }),
    subscribe: vi.fn().mockImplementation(async () => makePushSub()),
    pullSubscribe: vi.fn().mockImplementation(async () => makePullSub()),
    ...overrides,
  };
}

function makeJsmClient(overrides: Partial<MockJsmClient> = {}): MockJsmClient {
  return {
    streams: {
      info: vi.fn().mockResolvedValue(makeStreamInfo()),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      purge: vi.fn().mockResolvedValue({ purged: 0 }),
      getMessage: vi.fn().mockResolvedValue({
        info: { timestampNanos: (Date.now() - 100_000) * 1_000_000 },
      }),
      ...overrides.streams,
    },
  };
}

/**
 * Build a NatsClient mock that exposes `getRawConnection()` — matching the
 * public method JetStreamManager now calls via `requireRawConnection()`.
 */
function makeNatsClientWithConnection(
  jsClient: MockJsClient,
  jsmClient: MockJsmClient,
): NatsClient {
  const rawConn = {
    jetstream: vi.fn().mockReturnValue(jsClient),
    jetstreamManager: vi.fn().mockResolvedValue(jsmClient),
  };

  return { getRawConnection: () => rawConn } as unknown as NatsClient;
}

function defaultConfig(overrides: Partial<JetStreamConfig> = {}): JetStreamConfig {
  return {
    enabled: true,
    streamName: 'LOBSTER',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

let jsClient: MockJsClient;
let jsmClient: MockJsmClient;
let natsClient: NatsClient;
let manager: JetStreamManager;
let mockConsumerOpts: MockConsumerOpts;

beforeEach(() => {
  vi.clearAllMocks();
  jsClient = makeJsClient();
  jsmClient = makeJsmClient();
  natsClient = makeNatsClientWithConnection(jsClient, jsmClient);
  manager = new JetStreamManager(natsClient, defaultConfig());

  mockConsumerOpts = makeMockConsumerOpts();
  (natsModule.consumerOpts as ReturnType<typeof vi.fn>).mockReturnValue(mockConsumerOpts);
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe('JetStreamManager initialize()', () => {
  it('creates the stream when none exists', async () => {
    jsmClient.streams.info.mockRejectedValue(new Error('stream not found'));
    await manager.initialize();
    expect(jsmClient.streams.add).toHaveBeenCalledOnce();
  });

  it('updates the stream when it already exists', async () => {
    jsmClient.streams.info.mockResolvedValue(makeStreamInfo());
    await manager.initialize();
    expect(jsmClient.streams.update).toHaveBeenCalledOnce();
    expect(jsmClient.streams.add).not.toHaveBeenCalled();
  });

  it('passes the stream name from config', async () => {
    jsmClient.streams.info.mockRejectedValue(new Error('not found'));
    await manager.initialize();
    const [streamName] = jsmClient.streams.add.mock.calls[0] as [Record<string, unknown>];
    expect((streamName as Record<string, unknown>)['name']).toBe('LOBSTER');
  });

  it('is a no-op when config.enabled is false', async () => {
    const disabledManager = new JetStreamManager(natsClient, defaultConfig({ enabled: false }));
    await disabledManager.initialize();
    expect(jsmClient.streams.info).not.toHaveBeenCalled();
    expect(jsmClient.streams.add).not.toHaveBeenCalled();
  });

  it('calls jetstream() and jetstreamManager() on the underlying connection', async () => {
    const conn = natsClient.getRawConnection() as { jetstream: ReturnType<typeof vi.fn>; jetstreamManager: ReturnType<typeof vi.fn> };
    await manager.initialize();
    expect(conn.jetstream).toHaveBeenCalledOnce();
    expect(conn.jetstreamManager).toHaveBeenCalledOnce();
  });

  it('throws when NatsClient has no connection', async () => {
    // getRawConnection() returns undefined to simulate a disconnected client
    const unconnectedNats = { getRawConnection: () => undefined } as unknown as NatsClient;
    const m = new JetStreamManager(unconnectedNats, defaultConfig());
    await expect(m.initialize()).rejects.toThrow('not connected');
  });
});

// ---------------------------------------------------------------------------
// publish()
// ---------------------------------------------------------------------------

describe('JetStreamManager publish()', () => {
  it('throws when not initialized', async () => {
    await expect(manager.publish('bot.bot-1.event', { x: 1 })).rejects.toThrow('not initialized');
  });

  it('returns the sequence number and stream name', async () => {
    jsClient.publish.mockResolvedValue({ seq: 42, stream: 'LOBSTER' });
    await manager.initialize();
    const result = await manager.publish('bot.bot-1.event', { type: 'vote' });
    expect(result.seq).toBe(42);
    expect(result.stream).toBe('LOBSTER');
  });

  it('publishes to the correct subject', async () => {
    await manager.initialize();
    await manager.publish('bot.bot-1.event', { type: 'vote' });
    expect(jsClient.publish).toHaveBeenCalledOnce();
    const [subject] = jsClient.publish.mock.calls[0] as [string, Uint8Array];
    expect(subject).toBe('bot.bot-1.event');
  });

  it('encodes the payload as JSON bytes', async () => {
    await manager.initialize();
    const payload = { type: 'turn_start', botId: 'bot-1' };
    await manager.publish('bot.bot-1.event', payload);
    const [, bytes] = jsClient.publish.mock.calls[0] as [string, Uint8Array];
    const decoded = natsModule.JSONCodec<unknown>().decode(bytes);
    expect(decoded).toEqual(payload);
  });

  it('increments sequence numbers across multiple publishes', async () => {
    let seq = 0;
    jsClient.publish.mockImplementation(async () => ({ seq: ++seq, stream: 'LOBSTER' }));
    await manager.initialize();
    const r1 = await manager.publish('bot.b.event', { n: 1 });
    const r2 = await manager.publish('bot.b.event', { n: 2 });
    expect(r1.seq).toBe(1);
    expect(r2.seq).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// subscribe()
// ---------------------------------------------------------------------------

describe('JetStreamManager subscribe()', () => {
  it('throws when not initialized', async () => {
    await expect(
      manager.subscribe('bot.>', 'my-consumer', async () => undefined),
    ).rejects.toThrow('not initialized');
  });

  it('returns a subscription handle with unsubscribe()', async () => {
    const pushSub = makePushSub();
    jsClient.subscribe.mockResolvedValue(pushSub);
    await manager.initialize();
    const handle = await manager.subscribe('bot.>', 'my-consumer', async () => undefined);
    expect(handle).toHaveProperty('unsubscribe');
    pushSub.unsubscribe();
  });

  it('sets up a durable consumer with the provided name', async () => {
    const pushSub = makePushSub();
    jsClient.subscribe.mockResolvedValue(pushSub);
    await manager.initialize();
    await manager.subscribe('bot.>', 'durable-abc', async () => undefined);
    expect(mockConsumerOpts.durable).toHaveBeenCalledWith('durable-abc');
    pushSub.unsubscribe();
  });

  it('delivers decoded messages to the handler', async () => {
    const msg = makeMockJsMsg({
      data: natsModule.JSONCodec<unknown>().encode({ event: 'turn' }),
      subject: 'bot.b1.event',
    });
    const pushSub = makePushSub([msg]);
    jsClient.subscribe.mockResolvedValue(pushSub);
    await manager.initialize();

    const received: unknown[] = [];
    const subHandle = await manager.subscribe('bot.>', 'c', async (data) => {
      received.push(data);
      // Close after first message to stop the drain loop
      pushSub.unsubscribe();
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ event: 'turn' });
    subHandle.unsubscribe();
  });

  it('calls msg.ack() after handler succeeds', async () => {
    const msg = makeMockJsMsg();
    const pushSub = makePushSub([msg]);
    jsClient.subscribe.mockResolvedValue(pushSub);
    await manager.initialize();

    await manager.subscribe('bot.>', 'c', async () => {
      pushSub.unsubscribe();
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('calls msg.nak() when the handler throws', async () => {
    const msg = makeMockJsMsg();
    const pushSub = makePushSub([msg]);
    jsClient.subscribe.mockResolvedValue(pushSub);
    await manager.initialize();

    await manager.subscribe('bot.>', 'c', async () => {
      pushSub.unsubscribe();
      throw new Error('handler error');
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(msg.nak).toHaveBeenCalledOnce();
  });

  it('calls msg.term() when redeliveryCount exceeds MAX_REDELIVERIES', async () => {
    const msg = makeMockJsMsg({
      info: { timestampNanos: Date.now() * 1_000_000, redeliveryCount: 5 },
    });
    const pushSub = makePushSub([msg]);
    jsClient.subscribe.mockResolvedValue(pushSub);
    await manager.initialize();

    const handler = vi.fn().mockImplementation(async () => {
      pushSub.unsubscribe();
    });
    await manager.subscribe('bot.>', 'c', handler);

    await new Promise((r) => setTimeout(r, 20));
    expect(msg.term).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pullSubscribe()
// ---------------------------------------------------------------------------

describe('JetStreamManager pullSubscribe()', () => {
  it('throws when not initialized', async () => {
    await expect(
      manager.pullSubscribe('bot.>', 'pull-consumer', 10),
    ).rejects.toThrow('not initialized');
  });

  it('returns a PullSubscription with fetch() and unsubscribe()', async () => {
    const pullSub = makePullSub();
    jsClient.pullSubscribe.mockResolvedValue(pullSub);
    await manager.initialize();
    const sub = await manager.pullSubscribe('bot.>', 'pull-c', 10);
    expect(sub).toHaveProperty('fetch');
    expect(sub).toHaveProperty('unsubscribe');
    sub.unsubscribe();
  });

  it('fetch() returns decoded messages with metadata and ack callbacks', async () => {
    const payload = { type: 'vote', target: 'player-1' };
    const msg = makeMockJsMsg({
      data: natsModule.JSONCodec<unknown>().encode(payload),
      seq: 7,
      subject: 'bot.b1.action',
    });
    const pullSub = makePullSub([[msg]]);
    jsClient.pullSubscribe.mockResolvedValue(pullSub);
    await manager.initialize();
    const sub = await manager.pullSubscribe('bot.>', 'pull-c', 1);

    const results = await sub.fetch(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.data).toEqual(payload);
    expect(results[0]?.meta.seq).toBe(7);
    expect(results[0]?.meta.subject).toBe('bot.b1.action');
    expect(typeof results[0]?.ack).toBe('function');
    sub.unsubscribe();
  });

  it('ack() on a fetched message calls msg.ack()', async () => {
    const msg = makeMockJsMsg();
    const pullSub = makePullSub([[msg]]);
    jsClient.pullSubscribe.mockResolvedValue(pullSub);
    await manager.initialize();
    const sub = await manager.pullSubscribe('bot.>', 'pull-c', 1);

    const results = await sub.fetch(1);
    results[0]?.ack();
    expect(msg.ack).toHaveBeenCalledOnce();
    sub.unsubscribe();
  });

  it('fetch() with batch size limits the returned messages', async () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      makeMockJsMsg({ seq: i + 1 }),
    );
    const pullSub = makePullSub([msgs]);
    jsClient.pullSubscribe.mockResolvedValue(pullSub);
    await manager.initialize();
    const sub = await manager.pullSubscribe('bot.>', 'pull-c', 3);

    const results = await sub.fetch(3);
    expect(results.length).toBeLessThanOrEqual(3);
    sub.unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// streamInfo()
// ---------------------------------------------------------------------------

describe('JetStreamManager streamInfo()', () => {
  it('throws when not initialized', async () => {
    await expect(manager.streamInfo()).rejects.toThrow('not initialized');
  });

  it('returns stream statistics', async () => {
    jsmClient.streams.info.mockResolvedValue(
      makeStreamInfo({
        state: {
          messages: 42,
          bytes: 2_048,
          first_seq: 1,
          last_seq: 42,
          consumer_count: 3,
        },
      }),
    );
    await manager.initialize();
    const info = await manager.streamInfo();
    expect(info.name).toBe('LOBSTER');
    expect(info.messages).toBe(42);
    expect(info.bytes).toBe(2_048);
    expect(info.firstSeq).toBe(1);
    expect(info.lastSeq).toBe(42);
    expect(info.consumerCount).toBe(3);
  });

  it('includes subjects in the stream info', async () => {
    await manager.initialize();
    const info = await manager.streamInfo();
    expect(Array.isArray(info.subjects)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// purge()
// ---------------------------------------------------------------------------

describe('JetStreamManager purge()', () => {
  it('throws when not initialized', async () => {
    await expect(manager.purge()).rejects.toThrow('not initialized');
  });

  it('purges all messages when no olderThan is provided', async () => {
    jsmClient.streams.purge.mockResolvedValue({ purged: 50 });
    await manager.initialize();
    const purged = await manager.purge();
    expect(purged).toBe(50);
    expect(jsmClient.streams.purge).toHaveBeenCalledWith('LOBSTER');
  });

  it('returns 0 for an empty stream when olderThan is provided', async () => {
    // Empty stream: first_seq and last_seq both 0
    jsmClient.streams.info.mockResolvedValue(
      makeStreamInfo({
        state: {
          messages: 0,
          bytes: 0,
          first_seq: 0,
          last_seq: 0,
          consumer_count: 0,
        },
      }),
    );
    await manager.initialize();
    const purged = await manager.purge(3_600_000);
    expect(purged).toBe(0);
  });

  it('purges messages older than the provided threshold (seq-based boundary)', async () => {
    // Test the sequence-boundary logic of purge(olderThan):
    // The implementation reads msg.timestamp (ISO string) from StoredMsg and
    // compares it to (Date.now() - olderThan). We use a single-message stream
    // (firstSeq=lastSeq=1) so the loop runs exactly ONE iteration (seq=1).

    const thresholdMs = 3_600_000; // 1 hour
    // Message timestamp is 2 hours ago — well past the 1h threshold
    const twoHoursAgo = new Date(Date.now() - 7_200_000).toISOString();

    const purgeFn = vi.fn().mockResolvedValue({ purged: 1 });

    const isolatedJsm: MockJsmClient = {
      streams: {
        info: vi.fn().mockResolvedValue(
          makeStreamInfo({
            state: { messages: 1, bytes: 100, first_seq: 1, last_seq: 1, consumer_count: 0 },
          }),
        ),
        add: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        purge: purgeFn,
        // Single message at seq=1 — 2 hours old (well past 1h threshold)
        getMessage: vi.fn().mockResolvedValue({ timestamp: twoHoursAgo }),
      },
    };

    const isolatedNats = makeNatsClientWithConnection(makeJsClient(), isolatedJsm);
    const isolatedManager = new JetStreamManager(isolatedNats, defaultConfig());
    await isolatedManager.initialize();

    const purged = await isolatedManager.purge(thresholdMs);

    // getMessage should have been called for seq=1 (the only seq in the stream)
    expect(isolatedJsm.streams.getMessage).toHaveBeenCalledWith('LOBSTER', { seq: 1 });
    // Since seq=1 is the last seq and it's old, cutoffSeq=1 → purge({seq:2})
    expect(purgeFn).toHaveBeenCalledWith('LOBSTER', { seq: 2 });
    expect(purged).toBe(1);
  });

  it('returns 0 when no messages are older than the threshold', async () => {
    jsmClient.streams.info.mockResolvedValue(
      makeStreamInfo({
        state: {
          messages: 3,
          bytes: 256,
          first_seq: 1,
          last_seq: 3,
          consumer_count: 0,
        },
      }),
    );

    // All messages are newer than cutoff — timestamp is 10 seconds in the future
    const futureIso = new Date(Date.now() + 10_000).toISOString();
    jsmClient.streams.getMessage.mockResolvedValue({ timestamp: futureIso });

    await manager.initialize();
    const purged = await manager.purge(1_000); // 1s threshold — all messages are newer
    expect(purged).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('JetStreamManager destroy()', () => {
  it('clears internal references after destroy()', async () => {
    await manager.initialize();
    await manager.destroy();
    // After destroy, publish should throw (not initialized)
    await expect(manager.publish('bot.b1.event', {})).rejects.toThrow('not initialized');
  });

  it('is safe to call before initialize()', async () => {
    await expect(manager.destroy()).resolves.toBeUndefined();
  });

  it('is safe to call multiple times', async () => {
    await manager.initialize();
    await manager.destroy();
    await expect(manager.destroy()).resolves.toBeUndefined();
  });
});

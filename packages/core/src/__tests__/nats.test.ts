// @lobster-engine/core — NatsClient unit tests
//
// All tests mock the `nats` module so no real NATS server is required.

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { NatsClient } from '../nats.js';
import { NatsSubjects } from '../nats-subjects.js';
import * as natsModule from 'nats';

// ---------------------------------------------------------------------------
// Helpers — minimal nats mock types
// ---------------------------------------------------------------------------

interface MockMsg {
  data: Uint8Array;
  subject: string;
}

interface MockSubscription extends AsyncIterable<MockMsg> {
  unsubscribe: ReturnType<typeof vi.fn>;
  // Used in tests to inject messages.
  _push: (msg: MockMsg) => void;
  _close: () => void;
}

interface MockNatsConnection {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  drain: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  isClosed: ReturnType<typeof vi.fn>;
  isDraining: ReturnType<typeof vi.fn>;
  getServer: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  closed: ReturnType<typeof vi.fn>;
}

// ---------------------------------------------------------------------------
// Factory — create a mock subscription
// ---------------------------------------------------------------------------

function makeMockSubscription(): MockSubscription {
  const messages: MockMsg[] = [];
  const resolvers: Array<(value: IteratorResult<MockMsg>) => void> = [];
  let done = false;

  const sub: MockSubscription = {
    unsubscribe: vi.fn(() => {
      done = true;
      // Resolve all pending next() calls with done=true.
      for (const resolve of resolvers.splice(0)) {
        resolve({ value: undefined as unknown as MockMsg, done: true });
      }
    }),
    _push(msg: MockMsg) {
      const resolve = resolvers.shift();
      if (resolve !== undefined) {
        resolve({ value: msg, done: false });
      } else {
        messages.push(msg);
      }
    },
    _close() {
      done = true;
      for (const resolve of resolvers.splice(0)) {
        resolve({ value: undefined as unknown as MockMsg, done: true });
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<MockMsg>> {
          if (done && messages.length === 0) {
            return Promise.resolve({ value: undefined as unknown as MockMsg, done: true });
          }
          const buffered = messages.shift();
          if (buffered !== undefined) {
            return Promise.resolve({ value: buffered, done: false });
          }
          return new Promise((resolve) => resolvers.push(resolve));
        },
      };
    },
  };
  return sub;
}

// ---------------------------------------------------------------------------
// Factory — create a mock NatsConnection
// ---------------------------------------------------------------------------

function makeMockConnection(overrides: Partial<MockNatsConnection> = {}): MockNatsConnection {
  const statusSub = makeMockSubscription();

  const conn: MockNatsConnection = {
    publish: vi.fn(),
    subscribe: vi.fn(() => makeMockSubscription()),
    request: vi.fn(),
    drain: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    isDraining: vi.fn().mockReturnValue(false),
    getServer: vi.fn().mockReturnValue('nats://localhost:4222'),
    status: vi.fn().mockReturnValue(statusSub),
    flush: vi.fn().mockResolvedValue(undefined),
    closed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return conn;
}

// ---------------------------------------------------------------------------
// Mock `nats` module
// ---------------------------------------------------------------------------

vi.mock('nats', async (importOriginal) => {
  const actual = await importOriginal<typeof natsModule>();
  return {
    ...actual,
    connect: vi.fn(),
    // JSONCodec must remain functional so encode/decode works in tests.
    JSONCodec: actual.JSONCodec,
    Events: actual.Events,
  };
});

const mockedConnect = natsModule.connect as MockedFunction<typeof natsModule.connect>;

// ---------------------------------------------------------------------------
// Helper — encode data the same way NatsClient does (JSONCodec)
// ---------------------------------------------------------------------------

function encodeJson(data: unknown): Uint8Array {
  const codec = natsModule.JSONCodec<unknown>();
  return codec.encode(data);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NatsClient', () => {
  let client: NatsClient;
  let mockConn: MockNatsConnection;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new NatsClient();
    mockConn = makeMockConnection();
    mockedConnect.mockResolvedValue(mockConn as unknown as natsModule.NatsConnection);
  });

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  describe('connect()', () => {
    it('calls nats.connect with the provided options', async () => {
      await client.connect({ servers: ['nats://localhost:4222'], name: 'test' });

      expect(mockedConnect).toHaveBeenCalledOnce();
      expect(mockedConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          servers: ['nats://localhost:4222'],
          name: 'test',
        }),
      );
    });

    it('passes token when provided', async () => {
      await client.connect({ servers: ['nats://localhost:4222'], token: 'secret' });

      expect(mockedConnect).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'secret' }),
      );
    });

    it('uses default maxReconnectAttempts of 10 when not specified', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });

      expect(mockedConnect).toHaveBeenCalledWith(
        expect.objectContaining({ maxReconnectAttempts: 10 }),
      );
    });

    it('uses the provided maxReconnectAttempts', async () => {
      await client.connect({ servers: ['nats://localhost:4222'], maxReconnectAttempts: 5 });

      expect(mockedConnect).toHaveBeenCalledWith(
        expect.objectContaining({ maxReconnectAttempts: 5 }),
      );
    });

    it('is idempotent — second connect() call does not call nats.connect again', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      await client.connect({ servers: ['nats://localhost:4222'] });

      expect(mockedConnect).toHaveBeenCalledOnce();
    });
  });

  describe('disconnect()', () => {
    it('calls drain() on the underlying connection', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      await client.disconnect();

      expect(mockConn.drain).toHaveBeenCalledOnce();
    });

    it('is idempotent — safe to call when already disconnected', async () => {
      await client.disconnect(); // should not throw
    });

    it('sets client to disconnected state after drain', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('isConnected()', () => {
    it('returns false before connecting', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('returns true when connection is open and not draining', async () => {
      mockConn.isClosed.mockReturnValue(false);
      mockConn.isDraining.mockReturnValue(false);
      await client.connect({ servers: ['nats://localhost:4222'] });

      expect(client.isConnected()).toBe(true);
    });

    it('returns false when connection is closed', async () => {
      mockConn.isClosed.mockReturnValue(true);
      await client.connect({ servers: ['nats://localhost:4222'] });

      expect(client.isConnected()).toBe(false);
    });

    it('returns false when connection is draining', async () => {
      mockConn.isDraining.mockReturnValue(true);
      await client.connect({ servers: ['nats://localhost:4222'] });

      expect(client.isConnected()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  describe('publish()', () => {
    it('publishes a JSON-encoded message to the correct subject', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const payload = { type: 'vote', target: 'player-1' };

      client.publish('bot.bot-1.event', payload);

      expect(mockConn.publish).toHaveBeenCalledOnce();
      const [subject, data] = mockConn.publish.mock.calls[0] as [string, Uint8Array];
      expect(subject).toBe('bot.bot-1.event');

      const codec = natsModule.JSONCodec<unknown>();
      expect(codec.decode(data)).toEqual(payload);
    });

    it('throws when not connected', () => {
      expect(() => client.publish('some.subject', {})).toThrow(
        'NatsClient is not connected',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Subscribe / message flow
  // -------------------------------------------------------------------------

  describe('subscribe()', () => {
    it('returns a handle with unsubscribe()', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      const handler = vi.fn().mockResolvedValue(undefined);
      const handle = client.subscribe('bot.*.event', handler);

      expect(handle).toHaveProperty('unsubscribe');
    });

    it('calls the underlying subscribe with the correct subject', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });

      client.subscribe('bot.*.event', vi.fn().mockResolvedValue(undefined));

      expect(mockConn.subscribe).toHaveBeenCalledWith('bot.*.event');
    });

    it('delivers decoded messages to the handler', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      const received: unknown[] = [];
      client.subscribe('bot.*.event', async (data) => {
        received.push(data);
      });

      const payload = { event: 'turn_start', phase: 'day' };
      sub._push({ subject: 'bot.bot-1.event', data: encodeJson(payload) });

      // Allow async iterator microtask to flush.
      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(payload);
    });

    it('delivers multiple messages in order', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      const received: unknown[] = [];
      client.subscribe('bot.*.event', async (data) => {
        received.push(data);
      });

      sub._push({ subject: 'bot.bot-1.event', data: encodeJson({ seq: 1 }) });
      sub._push({ subject: 'bot.bot-2.event', data: encodeJson({ seq: 2 }) });
      sub._push({ subject: 'bot.bot-3.event', data: encodeJson({ seq: 3 }) });

      await new Promise((r) => setTimeout(r, 20));

      expect(received).toHaveLength(3);
      expect(received).toEqual([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
    });

    it('continues processing after handler throws', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      let callCount = 0;
      client.subscribe('test.subject', async () => {
        callCount++;
        if (callCount === 1) throw new Error('handler boom');
      });

      sub._push({ subject: 'test.subject', data: encodeJson({ n: 1 }) });
      sub._push({ subject: 'test.subject', data: encodeJson({ n: 2 }) });

      await new Promise((r) => setTimeout(r, 20));

      expect(callCount).toBe(2);
    });

    it('unsubscribe() stops message delivery', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      const handle = client.subscribe('test.subject', vi.fn().mockResolvedValue(undefined));
      handle.unsubscribe();

      expect(sub.unsubscribe).toHaveBeenCalledOnce();
    });

    it('throws when not connected', () => {
      expect(() =>
        client.subscribe('some.subject', vi.fn().mockResolvedValue(undefined)),
      ).toThrow('NatsClient is not connected');
    });
  });

  // -------------------------------------------------------------------------
  // Request / reply
  // -------------------------------------------------------------------------

  describe('request()', () => {
    it('sends a request and returns the decoded reply', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });

      const replyPayload = { status: 'ok', rtt: 12 };
      mockConn.request.mockResolvedValue({
        data: encodeJson(replyPayload),
        subject: '_INBOX.xyz',
      });

      const result = await client.request('system.health', { ping: true });

      expect(result).toEqual(replyPayload);
    });

    it('passes the correct subject and encoded payload', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      mockConn.request.mockResolvedValue({
        data: encodeJson({ ok: true }),
        subject: '_INBOX.abc',
      });

      const requestData = { query: 'ping' };
      await client.request('system.health', requestData, 3_000);

      expect(mockConn.request).toHaveBeenCalledOnce();
      const [subject, data, opts] = mockConn.request.mock.calls[0] as [
        string,
        Uint8Array,
        { timeout: number },
      ];
      expect(subject).toBe('system.health');

      const codec = natsModule.JSONCodec<unknown>();
      expect(codec.decode(data)).toEqual(requestData);
      expect(opts.timeout).toBe(3_000);
    });

    it('uses a default timeout of 5000ms', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      mockConn.request.mockResolvedValue({
        data: encodeJson({}),
        subject: '_INBOX.abc',
      });

      await client.request('system.health', {});

      const [, , opts] = mockConn.request.mock.calls[0] as [
        string,
        Uint8Array,
        { timeout: number },
      ];
      expect(opts.timeout).toBe(5_000);
    });

    it('throws when not connected', async () => {
      await expect(client.request('system.health', {})).rejects.toThrow(
        'NatsClient is not connected',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Queue group subscription
  // -------------------------------------------------------------------------

  describe('queueSubscribe()', () => {
    it('subscribes with the correct subject and queue option', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      client.queueSubscribe('worker.assign', 'lobster-workers', vi.fn().mockResolvedValue(undefined));

      expect(mockConn.subscribe).toHaveBeenCalledWith('worker.assign', {
        queue: 'lobster-workers',
      });
    });

    it('delivers messages to the queue handler', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      const received: unknown[] = [];
      client.queueSubscribe('worker.assign', 'lobster-workers', async (data) => {
        received.push(data);
      });

      sub._push({ subject: 'worker.assign', data: encodeJson({ task: 'run' }) });

      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ task: 'run' });
    });

    it('returns a handle that can unsubscribe', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      const sub = makeMockSubscription();
      mockConn.subscribe.mockReturnValue(sub);

      const handle = client.queueSubscribe('worker.assign', 'lobster-workers', vi.fn().mockResolvedValue(undefined));
      handle.unsubscribe();

      expect(sub.unsubscribe).toHaveBeenCalledOnce();
    });

    it('throws when not connected', () => {
      expect(() =>
        client.queueSubscribe('worker.assign', 'lobster-workers', vi.fn().mockResolvedValue(undefined)),
      ).toThrow('NatsClient is not connected');
    });
  });

  // -------------------------------------------------------------------------
  // Drain on shutdown
  // -------------------------------------------------------------------------

  describe('drain()', () => {
    it('drains the underlying connection and marks client as disconnected', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      await client.drain();

      expect(mockConn.drain).toHaveBeenCalledOnce();
      expect(client.isConnected()).toBe(false);
    });

    it('is idempotent — safe to call when already disconnected', async () => {
      await client.drain(); // should not throw
    });

    it('is safe to call after disconnect()', async () => {
      await client.connect({ servers: ['nats://localhost:4222'] });
      await client.disconnect();
      await client.drain(); // should not throw
    });
  });

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  describe('health()', () => {
    it('reports disconnected when not connected', () => {
      const h = client.health();
      expect(h.connected).toBe(false);
      expect(h.server).toBe('');
    });

    it('reports connected with server address when connected', async () => {
      mockConn.isClosed.mockReturnValue(false);
      mockConn.isDraining.mockReturnValue(false);
      mockConn.getServer.mockReturnValue('nats://localhost:4222');

      await client.connect({ servers: ['nats://localhost:4222'] });
      const h = client.health();

      expect(h.connected).toBe(true);
      expect(h.server).toBe('nats://localhost:4222');
    });

    it('reports not connected when connection is closed', async () => {
      mockConn.isClosed.mockReturnValue(true);
      await client.connect({ servers: ['nats://localhost:4222'] });

      const h = client.health();
      expect(h.connected).toBe(false);
    });

    it('reports not connected when connection is draining', async () => {
      mockConn.isClosed.mockReturnValue(false);
      mockConn.isDraining.mockReturnValue(true);
      await client.connect({ servers: ['nats://localhost:4222'] });

      const h = client.health();
      expect(h.connected).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// NatsSubjects — typed object API
// ---------------------------------------------------------------------------

describe('NatsSubjects', () => {
  describe('bot subjects', () => {
    it('botEvent generates the correct subject', () => {
      expect(NatsSubjects.botEvent('bot-42')).toBe('bot.bot-42.event');
    });

    it('botAction generates the correct subject', () => {
      expect(NatsSubjects.botAction('bot-42')).toBe('bot.bot-42.action');
    });

    it('botState generates the correct subject', () => {
      expect(NatsSubjects.botState('bot-42')).toBe('bot.bot-42.state');
    });
  });

  describe('scene subjects', () => {
    it('sceneBroadcast generates the correct subject', () => {
      expect(NatsSubjects.sceneBroadcast('scene-abc')).toBe('scene.scene-abc.broadcast');
    });

    it('sceneState generates the correct subject', () => {
      expect(NatsSubjects.sceneState('scene-abc')).toBe('scene.scene-abc.state');
    });
  });

  describe('system subjects', () => {
    it('systemHealth is the correct constant', () => {
      expect(NatsSubjects.systemHealth).toBe('system.health');
    });

    it('systemMetrics is the correct constant', () => {
      expect(NatsSubjects.systemMetrics).toBe('system.metrics');
    });

    it('systemControl is the correct constant', () => {
      expect(NatsSubjects.systemControl).toBe('system.control');
    });
  });

  describe('worker subjects', () => {
    it('workerHeartbeat generates the correct subject', () => {
      expect(NatsSubjects.workerHeartbeat('worker-1')).toBe('worker.worker-1.heartbeat');
    });

    it('workerAssign is the correct constant', () => {
      expect(NatsSubjects.workerAssign).toBe('worker.assign');
    });

    it('workerResult is the correct constant', () => {
      expect(NatsSubjects.workerResult).toBe('worker.result');
    });
  });

  describe('subject format consistency', () => {
    it('all dynamic subjects use dot-separated tokens', () => {
      const subjects = [
        NatsSubjects.botEvent('x'),
        NatsSubjects.botAction('x'),
        NatsSubjects.botState('x'),
        NatsSubjects.sceneBroadcast('x'),
        NatsSubjects.sceneState('x'),
        NatsSubjects.workerHeartbeat('x'),
      ];
      for (const s of subjects) {
        expect(s).toMatch(/^[a-z]+\.[^.]+\.[a-z]+$/);
      }
    });
  });
});

// @lobster-engine/storage-redis — RedisProvider unit tests
// All ioredis interactions are fully mocked; no real Redis connection is made.

import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { RedisProvider } from '../index.js';

// ---------------------------------------------------------------------------
// ioredis mock
// ---------------------------------------------------------------------------
// We mock the entire 'ioredis' module so that `new Redis(...)` returns a
// controllable fake client.  Each test rebuilds the fake via `makeClient()`.

type PipelineResult = [Error | null, unknown];

interface FakeClient {
  ping: MockInstance;
  quit: MockInstance;
  get: MockInstance;
  set: MockInstance;
  del: MockInstance;
  mget: MockInstance;
  scan: MockInstance;
  pipeline: MockInstance;
}

// Shared reference updated per-test via resetClient().
let fakeClient: FakeClient;

function makePipeline(
  results: PipelineResult[] = []
): { set: MockInstance; exec: MockInstance } {
  const pipe = {
    set: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(results),
  };
  return pipe;
}

function makeClient(): FakeClient {
  return {
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    mget: vi.fn().mockResolvedValue([]),
    // Default scan: single cursor-0 response returning no keys
    scan: vi.fn().mockResolvedValue(['0', []]),
    pipeline: vi.fn().mockReturnValue(makePipeline()),
  };
}

vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => fakeClient);
  return { default: RedisMock };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectedProvider(config?: ConstructorParameters<typeof RedisProvider>[0]): RedisProvider {
  // We call connect() synchronously via the mock — use this in async helpers.
  return new RedisProvider(config);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RedisProvider', () => {
  beforeEach(() => {
    fakeClient = makeClient();
    vi.clearAllMocks();
    // Restore fakeClient after vi.clearAllMocks() clears the spies
    fakeClient = makeClient();
  });

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  describe('connect()', () => {
    it('creates a Redis client and pings on connect', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      expect(fakeClient.ping).toHaveBeenCalledOnce();
    });

    it('builds client with url when url config is provided', async () => {
      const { default: RedisMock } = await import('ioredis');
      const provider = new RedisProvider({ url: 'redis://localhost:6379' });
      await provider.connect();
      // First arg to the constructor should be the url string
      expect((RedisMock as unknown as MockInstance).mock.calls[0][0]).toBe('redis://localhost:6379');
    });

    it('builds client with host/port options when url is not provided', async () => {
      const { default: RedisMock } = await import('ioredis');
      const provider = new RedisProvider({ host: '10.0.0.1', port: 6380 });
      await provider.connect();
      const opts = (RedisMock as unknown as MockInstance).mock.calls[0][0] as Record<string, unknown>;
      expect(opts.host).toBe('10.0.0.1');
      expect(opts.port).toBe(6380);
    });

    it('sets lazyConnect: true in the options forwarded to ioredis', async () => {
      const { default: RedisMock } = await import('ioredis');
      const provider = new RedisProvider();
      await provider.connect();
      // For the default (no-url) path, the single arg is the options object
      const opts = (RedisMock as unknown as MockInstance).mock.calls[0][0] as Record<string, unknown>;
      expect(opts.lazyConnect).toBe(true);
    });

    it('propagates ping errors so the caller knows the connection failed', async () => {
      fakeClient.ping.mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = new RedisProvider();
      await expect(provider.connect()).rejects.toThrow('ECONNREFUSED');
    });
  });

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe('disconnect()', () => {
    it('calls quit on the underlying client', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      await provider.disconnect();
      expect(fakeClient.quit).toHaveBeenCalledOnce();
    });

    it('nullifies the client reference so health returns false after disconnect', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      await provider.disconnect();
      expect(await provider.health()).toBe(false);
    });

    it('is a no-op when called before connect', async () => {
      const provider = new RedisProvider();
      // Should not throw
      await expect(provider.disconnect()).resolves.toBeUndefined();
      expect(fakeClient.quit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // health()
  // -------------------------------------------------------------------------

  describe('health()', () => {
    it('returns true when Redis replies with PONG', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.ping.mockResolvedValue('PONG');
      expect(await provider.health()).toBe(true);
    });

    it('returns false when the client is not connected', async () => {
      const provider = new RedisProvider();
      expect(await provider.health()).toBe(false);
    });

    it('returns false when ping throws an error', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.ping.mockRejectedValue(new Error('timeout'));
      expect(await provider.health()).toBe(false);
    });

    it('returns false when ping returns something other than PONG', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.ping.mockResolvedValue('ERR');
      expect(await provider.health()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // get() / set()
  // -------------------------------------------------------------------------

  describe('get()', () => {
    it('returns the parsed JSON value stored at the prefixed key', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.get.mockResolvedValue(JSON.stringify({ score: 42 }));
      const result = await provider.get<{ score: number }>('user:1');
      expect(result).toEqual({ score: 42 });
      expect(fakeClient.get).toHaveBeenCalledWith('lobster:user:1');
    });

    it('returns null when the key does not exist', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.get.mockResolvedValue(null);
      expect(await provider.get('missing')).toBeNull();
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.get('key')).rejects.toThrow('not connected');
    });

    it('propagates Redis errors to the caller', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.get.mockRejectedValue(new Error('READONLY'));
      await expect(provider.get('key')).rejects.toThrow('READONLY');
    });
  });

  describe('set()', () => {
    it('serializes the value as JSON and calls SET without EX when no ttl', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      await provider.set('session:abc', { token: 'xyz' });
      expect(fakeClient.set).toHaveBeenCalledWith(
        'lobster:session:abc',
        JSON.stringify({ token: 'xyz' })
      );
    });

    it('passes EX and the ttl value when ttl is provided', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      await provider.set('session:abc', { token: 'xyz' }, 300);
      expect(fakeClient.set).toHaveBeenCalledWith(
        'lobster:session:abc',
        JSON.stringify({ token: 'xyz' }),
        'EX',
        300
      );
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.set('key', 'value')).rejects.toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('returns true when the key was deleted', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.del.mockResolvedValue(1);
      expect(await provider.delete('user:1')).toBe(true);
      expect(fakeClient.del).toHaveBeenCalledWith('lobster:user:1');
    });

    it('returns false when the key did not exist', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.del.mockResolvedValue(0);
      expect(await provider.delete('ghost')).toBe(false);
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.delete('key')).rejects.toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // getMany()
  // -------------------------------------------------------------------------

  describe('getMany()', () => {
    it('returns an empty Map when the keys array is empty', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      const result = await provider.getMany([]);
      expect(result.size).toBe(0);
      expect(fakeClient.mget).not.toHaveBeenCalled();
    });

    it('returns parsed values for each key using prefixed keys in mget', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.mget.mockResolvedValue([
        JSON.stringify({ a: 1 }),
        JSON.stringify({ b: 2 }),
      ]);
      const result = await provider.getMany(['k1', 'k2']);
      expect(fakeClient.mget).toHaveBeenCalledWith('lobster:k1', 'lobster:k2');
      expect(result.get('k1')).toEqual({ a: 1 });
      expect(result.get('k2')).toEqual({ b: 2 });
    });

    it('omits keys whose Redis value is null', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.mget.mockResolvedValue([JSON.stringify({ x: 9 }), null]);
      const result = await provider.getMany(['present', 'absent']);
      expect(result.has('present')).toBe(true);
      expect(result.has('absent')).toBe(false);
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.getMany(['k'])).rejects.toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // setMany()
  // -------------------------------------------------------------------------

  describe('setMany()', () => {
    it('is a no-op when the entries Map is empty', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      await provider.setMany(new Map());
      expect(fakeClient.pipeline).not.toHaveBeenCalled();
    });

    it('enqueues one pipeline SET per entry without EX when no ttl', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      const pipe = makePipeline([[null, 'OK'], [null, 'OK']]);
      fakeClient.pipeline.mockReturnValue(pipe);

      const entries = new Map([
        ['a', { v: 1 }],
        ['b', { v: 2 }],
      ]);
      await provider.setMany(entries);

      expect(pipe.set).toHaveBeenCalledWith('lobster:a', JSON.stringify({ v: 1 }));
      expect(pipe.set).toHaveBeenCalledWith('lobster:b', JSON.stringify({ v: 2 }));
      expect(pipe.exec).toHaveBeenCalledOnce();
    });

    it('enqueues pipeline SET with EX when ttl is provided', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      const pipe = makePipeline([[null, 'OK']]);
      fakeClient.pipeline.mockReturnValue(pipe);

      await provider.setMany(new Map([['key', 'val']]), 60);
      expect(pipe.set).toHaveBeenCalledWith('lobster:key', JSON.stringify('val'), 'EX', 60);
    });

    it('throws when a pipeline command returns an error', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      const pipe = makePipeline([[new Error('WRONGTYPE'), null]]);
      fakeClient.pipeline.mockReturnValue(pipe);

      await expect(provider.setMany(new Map([['k', 'v']]))).rejects.toThrow(
        'RedisProvider.setMany pipeline error'
      );
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.setMany(new Map([['k', 'v']]))).rejects.toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // query()
  // -------------------------------------------------------------------------

  describe('query()', () => {
    it('returns all matching values when scan returns keys', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue(['0', ['lobster:users:1', 'lobster:users:2']]);
      fakeClient.mget.mockResolvedValue([
        JSON.stringify({ id: 1 }),
        JSON.stringify({ id: 2 }),
      ]);

      const results = await provider.query({ prefix: 'users:' });
      expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('builds a scan MATCH pattern using the key prefix and the filter prefix', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      await provider.query({ prefix: 'session:' });

      expect(fakeClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'lobster:session:*',
        'COUNT',
        200
      );
    });

    it('uses a wildcard MATCH pattern when no filter prefix is given', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      await provider.query({});

      expect(fakeClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'lobster:*',
        'COUNT',
        200
      );
    });

    it('respects limit and offset when slicing matched keys', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue([
        '0',
        ['lobster:k0', 'lobster:k1', 'lobster:k2', 'lobster:k3'],
      ]);
      fakeClient.mget.mockResolvedValue([
        JSON.stringify('v1'),
        JSON.stringify('v2'),
      ]);

      await provider.query({ offset: 1, limit: 2 });
      // mget should be called with keys[1] and keys[2] only
      expect(fakeClient.mget).toHaveBeenCalledWith('lobster:k1', 'lobster:k2');
    });

    it('returns empty array when scan finds no keys', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue(['0', []]);
      const results = await provider.query({ prefix: 'nothing:' });
      expect(results).toEqual([]);
      expect(fakeClient.mget).not.toHaveBeenCalled();
    });

    it('skips null entries returned by mget', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue(['0', ['lobster:a', 'lobster:b']]);
      fakeClient.mget.mockResolvedValue([JSON.stringify('alive'), null]);

      const results = await provider.query({});
      expect(results).toEqual(['alive']);
    });

    it('iterates multiple scan pages until cursor returns to 0', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan
        .mockResolvedValueOnce(['42', ['lobster:p1']])
        .mockResolvedValueOnce(['0', ['lobster:p2']]);
      fakeClient.mget.mockResolvedValue([JSON.stringify(1), JSON.stringify(2)]);

      await provider.query({});
      expect(fakeClient.scan).toHaveBeenCalledTimes(2);
      expect(fakeClient.mget).toHaveBeenCalledWith('lobster:p1', 'lobster:p2');
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.query({})).rejects.toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // count()
  // -------------------------------------------------------------------------

  describe('count()', () => {
    it('returns the total number of matched keys when no limit is set', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue(['0', ['lobster:a', 'lobster:b', 'lobster:c']]);
      expect(await provider.count({})).toBe(3);
    });

    it('applies offset before counting', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue([
        '0',
        ['lobster:a', 'lobster:b', 'lobster:c'],
      ]);
      expect(await provider.count({ offset: 1 })).toBe(2);
    });

    it('caps the count at limit', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue([
        '0',
        ['lobster:a', 'lobster:b', 'lobster:c', 'lobster:d'],
      ]);
      expect(await provider.count({ limit: 2 })).toBe(2);
    });

    it('returns 0 when offset exceeds the number of matched keys', async () => {
      const provider = new RedisProvider();
      await provider.connect();

      fakeClient.scan.mockResolvedValue(['0', ['lobster:a']]);
      expect(await provider.count({ offset: 5 })).toBe(0);
    });

    it('throws when called before connect', async () => {
      const provider = new RedisProvider();
      await expect(provider.count({})).rejects.toThrow('not connected');
    });
  });

  // -------------------------------------------------------------------------
  // Key prefix support
  // -------------------------------------------------------------------------

  describe('key prefix', () => {
    it('defaults to "lobster:" when no keyPrefix is configured', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      await provider.get('mykey');
      expect(fakeClient.get).toHaveBeenCalledWith('lobster:mykey');
    });

    it('uses the custom keyPrefix for get', async () => {
      const provider = new RedisProvider({ keyPrefix: 'custom:' });
      await provider.connect();
      await provider.get('mykey');
      expect(fakeClient.get).toHaveBeenCalledWith('custom:mykey');
    });

    it('uses the custom keyPrefix for set', async () => {
      const provider = new RedisProvider({ keyPrefix: 'ns:' });
      await provider.connect();
      await provider.set('k', 'v');
      expect(fakeClient.set).toHaveBeenCalledWith('ns:k', JSON.stringify('v'));
    });

    it('uses the custom keyPrefix for delete', async () => {
      const provider = new RedisProvider({ keyPrefix: 'ns:' });
      await provider.connect();
      await provider.delete('k');
      expect(fakeClient.del).toHaveBeenCalledWith('ns:k');
    });

    it('uses the custom keyPrefix for getMany', async () => {
      const provider = new RedisProvider({ keyPrefix: 'ns:' });
      await provider.connect();
      fakeClient.mget.mockResolvedValue([null]);
      await provider.getMany(['k']);
      expect(fakeClient.mget).toHaveBeenCalledWith('ns:k');
    });

    it('uses the custom keyPrefix for scan pattern in query', async () => {
      const provider = new RedisProvider({ keyPrefix: 'game:' });
      await provider.connect();
      await provider.query({ prefix: 'room:' });
      expect(fakeClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'game:room:*',
        'COUNT',
        200
      );
    });

    it('escapes glob special characters in the filter prefix', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      // The filter prefix contains a glob wildcard — it must be escaped
      await provider.query({ prefix: 'item[rare]*' });
      expect(fakeClient.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'lobster:item\\[rare\\]\\**',
        'COUNT',
        200
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  describe('error propagation', () => {
    it('surfaces Redis errors from get to the caller', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.get.mockRejectedValue(new Error('LOADING Redis is loading'));
      await expect(provider.get('k')).rejects.toThrow('LOADING');
    });

    it('surfaces Redis errors from set to the caller', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.set.mockRejectedValue(new Error('OOM'));
      await expect(provider.set('k', 'v')).rejects.toThrow('OOM');
    });

    it('surfaces Redis errors from del to the caller', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.del.mockRejectedValue(new Error('NOSCRIPT'));
      await expect(provider.delete('k')).rejects.toThrow('NOSCRIPT');
    });

    it('surfaces Redis errors from mget to the caller', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.mget.mockRejectedValue(new Error('CLUSTERDOWN'));
      await expect(provider.getMany(['k'])).rejects.toThrow('CLUSTERDOWN');
    });

    it('surfaces Redis errors from scan to the caller via query', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.scan.mockRejectedValue(new Error('MOVED'));
      await expect(provider.query({})).rejects.toThrow('MOVED');
    });

    it('surfaces Redis errors from scan to the caller via count', async () => {
      const provider = new RedisProvider();
      await provider.connect();
      fakeClient.scan.mockRejectedValue(new Error('MOVED'));
      await expect(provider.count({})).rejects.toThrow('MOVED');
    });
  });

  // -------------------------------------------------------------------------
  // provider.name
  // -------------------------------------------------------------------------

  describe('name', () => {
    it('exposes "redis" as the provider name', () => {
      expect(new RedisProvider().name).toBe('redis');
    });
  });
});

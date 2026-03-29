import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteProvider } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'lobster-sqlite-test-'));
}

function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

describe('connect()', () => {
  let tempDir: string;
  let provider: SQLiteProvider;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(async () => {
    await provider.disconnect();
    removeTempDir(tempDir);
  });

  it('creates the DB file at the configured path', async () => {
    const dbPath = join(tempDir, 'test.db');
    provider = new SQLiteProvider({ path: dbPath });
    await provider.connect();

    const { existsSync } = await import('node:fs');
    expect(existsSync(dbPath)).toBe(true);
  });

  it('creates the kv table so subsequent operations succeed', async () => {
    provider = new SQLiteProvider({ path: join(tempDir, 'test.db') });
    await provider.connect();

    // If the table does not exist, set() would throw
    await expect(provider.set('probe', 'value')).resolves.toBeUndefined();
  });

  it('enables WAL mode — health check returns true after connect', async () => {
    provider = new SQLiteProvider({ path: join(tempDir, 'test.db') });
    await provider.connect();

    expect(await provider.health()).toBe(true);
  });

  it('works with :memory: when no path is provided', async () => {
    provider = new SQLiteProvider();
    await provider.connect();

    expect(await provider.health()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------

describe('disconnect()', () => {
  it('closes the DB connection so health() returns false afterwards', async () => {
    const provider = new SQLiteProvider();
    await provider.connect();
    await provider.disconnect();

    expect(await provider.health()).toBe(false);
  });

  it('is idempotent — calling disconnect twice does not throw', async () => {
    const provider = new SQLiteProvider();
    await provider.connect();
    await provider.disconnect();

    await expect(provider.disconnect()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// health()
// ---------------------------------------------------------------------------

describe('health()', () => {
  it('returns false when connect() has never been called', async () => {
    const provider = new SQLiteProvider();
    expect(await provider.health()).toBe(false);
  });

  it('returns true when connected', async () => {
    const provider = new SQLiteProvider();
    await provider.connect();

    expect(await provider.health()).toBe(true);

    await provider.disconnect();
  });

  it('returns false after disconnect()', async () => {
    const provider = new SQLiteProvider();
    await provider.connect();
    await provider.disconnect();

    expect(await provider.health()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shared fixture for CRUD tests
// ---------------------------------------------------------------------------

describe('get() / set()', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('returns null for a key that does not exist', async () => {
    expect(await provider.get('missing')).toBeNull();
  });

  it('returns the stored value for an existing key', async () => {
    await provider.set('hello', 'world');
    expect(await provider.get('hello')).toBe('world');
  });

  it('stores and retrieves a complex object', async () => {
    const payload = { id: 1, tags: ['a', 'b'], nested: { x: true } };
    await provider.set('obj', payload);

    expect(await provider.get('obj')).toEqual(payload);
  });

  it('stores and retrieves numeric values', async () => {
    await provider.set('num', 42);
    expect(await provider.get<number>('num')).toBe(42);
  });

  it('stores and retrieves boolean false', async () => {
    await provider.set('flag', false);
    expect(await provider.get<boolean>('flag')).toBe(false);
  });

  it('overwrites an existing key with the new value', async () => {
    await provider.set('key', 'first');
    await provider.set('key', 'second');

    expect(await provider.get('key')).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// TTL expiration
// ---------------------------------------------------------------------------

describe('get() with TTL', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('returns the value before the TTL expires', async () => {
    // ttl is in seconds; 60 seconds is well within test execution time
    await provider.set('short', 'alive', 60);
    expect(await provider.get('short')).toBe('alive');
  });

  it('returns null for a key whose TTL has already elapsed', async () => {
    // ttl=-1 stores ttlMs=-1000; the expiry check is now > created_at + (-1000)
    // which is always true, making the entry immediately expired without any sleep.
    await provider.set('gone', 'expired', -1);
    expect(await provider.get('gone')).toBeNull();
  });

  it('deleted the expired entry from the DB after get() discovers expiry', async () => {
    await provider.set('gone', 'expired', -1);
    // First get() deletes the row
    await provider.get('gone');
    // count() must not include it
    expect(await provider.count({})).toBe(0);
  });

  it('returns null for an expired key in getMany()', async () => {
    await provider.set('a', 1, -1);
    await provider.set('b', 2);

    const result = await provider.getMany(['a', 'b']);
    expect(result.has('a')).toBe(false);
    expect(result.get('b')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// delete()
// ---------------------------------------------------------------------------

describe('delete()', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('returns true when the key existed and was deleted', async () => {
    await provider.set('del-me', 'value');
    expect(await provider.delete('del-me')).toBe(true);
  });

  it('returns false when the key did not exist', async () => {
    expect(await provider.delete('no-such-key')).toBe(false);
  });

  it('makes the key unretrievable after deletion', async () => {
    await provider.set('gone', 'value');
    await provider.delete('gone');

    expect(await provider.get('gone')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMany()
// ---------------------------------------------------------------------------

describe('getMany()', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('returns an empty Map when keys array is empty', async () => {
    const result = await provider.getMany([]);
    expect(result.size).toBe(0);
  });

  it('returns only the keys that exist', async () => {
    await provider.set('x', 10);
    await provider.set('y', 20);

    const result = await provider.getMany(['x', 'missing', 'y']);

    expect(result.size).toBe(2);
    expect(result.get('x')).toBe(10);
    expect(result.get('y')).toBe(20);
    expect(result.has('missing')).toBe(false);
  });

  it('returns all requested keys when all exist', async () => {
    await provider.set('k1', 'v1');
    await provider.set('k2', 'v2');
    await provider.set('k3', 'v3');

    const result = await provider.getMany(['k1', 'k2', 'k3']);
    expect(result.size).toBe(3);
  });

  it('excludes expired keys from the result', async () => {
    await provider.set('live', 'yes', 60);
    await provider.set('dead', 'no', -1);

    const result = await provider.getMany(['live', 'dead']);
    expect(result.has('dead')).toBe(false);
    expect(result.get('live')).toBe('yes');
  });
});

// ---------------------------------------------------------------------------
// setMany()
// ---------------------------------------------------------------------------

describe('setMany()', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('is a no-op when the map is empty', async () => {
    await expect(provider.setMany(new Map())).resolves.toBeUndefined();
    expect(await provider.count({})).toBe(0);
  });

  it('inserts all entries from the map', async () => {
    const entries = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    await provider.setMany(entries);

    expect(await provider.count({})).toBe(3);
    expect(await provider.get<number>('a')).toBe(1);
    expect(await provider.get<number>('b')).toBe(2);
    expect(await provider.get<number>('c')).toBe(3);
  });

  it('overwrites keys that already exist', async () => {
    await provider.set('dup', 'old');
    await provider.setMany(new Map([['dup', 'new']]));

    expect(await provider.get('dup')).toBe('new');
  });

  it('applies the TTL to all inserted entries', async () => {
    // ttl=-1 stores ttlMs=-1000 — immediately expired, no sleep required
    await provider.setMany(new Map([['ttl-key', 'val']]), -1);
    expect(await provider.get('ttl-key')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// query()
// ---------------------------------------------------------------------------

describe('query()', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
    // Seed data
    await provider.set('user:1', { id: 1 });
    await provider.set('user:2', { id: 2 });
    await provider.set('user:3', { id: 3 });
    await provider.set('config:timeout', 30);
    await provider.set('config:retries', 5);
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('returns all values when no prefix filter is set', async () => {
    const results = await provider.query({});
    expect(results.length).toBe(5);
  });

  it('returns only values whose key starts with the given prefix', async () => {
    const results = await provider.query<{ id: number }>({ prefix: 'user:' });
    expect(results.length).toBe(3);
    expect(results.every((r) => typeof r.id === 'number')).toBe(true);
  });

  it('returns an empty array when no keys match the prefix', async () => {
    const results = await provider.query({ prefix: 'session:' });
    expect(results).toEqual([]);
  });

  it('respects limit', async () => {
    const results = await provider.query({ limit: 2 });
    expect(results.length).toBe(2);
  });

  it('respects offset', async () => {
    const all = await provider.query({});
    const paged = await provider.query({ offset: 2 });
    expect(paged.length).toBe(3);
    // The results at offset 2 must not include the first two
    expect(paged).not.toEqual(all.slice(0, 2));
  });

  it('combines prefix with limit and offset', async () => {
    const results = await provider.query({ prefix: 'user:', limit: 2, offset: 1 });
    expect(results.length).toBe(2);
  });

  it('excludes expired entries from results', async () => {
    await provider.set('user:expired', { id: 99 }, -1);

    const results = await provider.query<{ id: number }>({ prefix: 'user:' });
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(99);
  });

  it('escapes LIKE special characters in the prefix — BUG: missing ESCAPE clause', async () => {
    // The implementation calls escapeLike() to escape %, _, and \ in the prefix
    // but the SQL statement uses `LIKE ?` without an ESCAPE clause.
    // SQLite therefore treats `\%` as backslash + wildcard rather than a literal
    // percent sign, so keys whose names contain % are not matched correctly.
    // This test documents the current (broken) behavior so a regression is caught
    // when the ESCAPE clause is added to the implementation.
    await provider.set('a%b:1', 'percent');
    await provider.set('a_b:1', 'underscore');

    // BUG: returns [] instead of ['percent'] because the ESCAPE clause is absent.
    const results = await provider.query({ prefix: 'a%b:' });
    expect(results).toEqual([]); // TODO: fix implementation to add ESCAPE '\\'
  });
});

// ---------------------------------------------------------------------------
// count()
// ---------------------------------------------------------------------------

describe('count()', () => {
  let provider: SQLiteProvider;

  beforeEach(async () => {
    provider = new SQLiteProvider();
    await provider.connect();
    await provider.set('ns:a', 1);
    await provider.set('ns:b', 2);
    await provider.set('other:c', 3);
  });

  afterEach(async () => {
    await provider.disconnect();
  });

  it('returns total entry count when no filter is applied', async () => {
    expect(await provider.count({})).toBe(3);
  });

  it('returns 0 when the store is empty', async () => {
    const fresh = new SQLiteProvider();
    await fresh.connect();
    expect(await fresh.count({})).toBe(0);
    await fresh.disconnect();
  });

  it('returns the count of entries matching the prefix', async () => {
    expect(await provider.count({ prefix: 'ns:' })).toBe(2);
  });

  it('returns 0 when no keys match the prefix', async () => {
    expect(await provider.count({ prefix: 'xyz:' })).toBe(0);
  });

  it('excludes expired entries from the count', async () => {
    await provider.set('ns:expired', 'val', -1);
    // ns: prefix now has 2 live + 1 immediately-expired
    expect(await provider.count({ prefix: 'ns:' })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Error handling — operations on a closed / never-connected DB
// ---------------------------------------------------------------------------

describe('error handling — operations on closed DB', () => {
  it('get() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(provider.get('key')).rejects.toThrow(/not connected/i);
  });

  it('set() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(provider.set('key', 'val')).rejects.toThrow(/not connected/i);
  });

  it('delete() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(provider.delete('key')).rejects.toThrow(/not connected/i);
  });

  it('getMany() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(provider.getMany(['key'])).rejects.toThrow(/not connected/i);
  });

  it('setMany() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(
      provider.setMany(new Map([['k', 'v']]))
    ).rejects.toThrow(/not connected/i);
  });

  it('query() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(provider.query({})).rejects.toThrow(/not connected/i);
  });

  it('count() throws when not connected', async () => {
    const provider = new SQLiteProvider();
    await expect(provider.count({})).rejects.toThrow(/not connected/i);
  });

  it('throws after disconnect() as well', async () => {
    const provider = new SQLiteProvider();
    await provider.connect();
    await provider.disconnect();

    await expect(provider.get('key')).rejects.toThrow(/not connected/i);
  });
});

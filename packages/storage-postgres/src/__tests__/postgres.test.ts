// @lobster-engine/storage-postgres — unit tests with mocked pg Pool

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { PostgresProvider } from '../index.js';
import { MigrationRunner } from '../migrations.js';

// ---------------------------------------------------------------------------
// In-memory store shapes
// ---------------------------------------------------------------------------

interface KvEntry {
  value: unknown;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MigrationEntry {
  id: number;
  name: string;
  executedAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryResult<T extends Record<string, unknown>>(
  rows: T[],
  rowCount = rows.length
): QueryResult<T> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

function isExpired(entry: KvEntry): boolean {
  if (entry.expiresAt === null) return false;
  return entry.expiresAt <= new Date();
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// SQL dispatcher — translates parameterised SQL into in-memory operations.
//
// We classify each SQL statement by its VERB + TABLE HINT combination so the
// routing is unambiguous even when the table name is dynamic.
// ---------------------------------------------------------------------------

type DispatchCtx = {
  store: Map<string, KvEntry>;
  migrations: Map<string, MigrationEntry>;
};

function dispatch(
  sql: string,
  params: unknown[],
  ctx: DispatchCtx
): QueryResult {
  const s = normalize(sql);

  // ---- DDL / transaction control ----------------------------------------
  if (
    s.startsWith('CREATE TABLE') ||
    s.startsWith('CREATE INDEX') ||
    s.startsWith('BEGIN') ||
    s.startsWith('COMMIT') ||
    s.startsWith('ROLLBACK')
  ) {
    return makeQueryResult([], 0);
  }

  // ---- Health check -------------------------------------------------------
  if (/^SELECT 1/.test(s)) {
    return makeQueryResult([{ ok: 1 }]);
  }

  // ---- migrations table — SELECT -----------------------------------------
  if (s.startsWith('SELECT') && s.includes('LOBSTER_MIGRATIONS')) {
    const rows = [...ctx.migrations.values()]
      .sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime())
      .map((m) => ({ name: m.name, executed_at: m.executedAt }));

    if (s.includes('LIMIT')) {
      const limit = Number(params[0]);
      return makeQueryResult(rows.slice(0, limit));
    }
    // Return ascending for status query
    return makeQueryResult(
      rows.sort((a, b) => a.executed_at.getTime() - b.executed_at.getTime())
    );
  }

  // ---- migrations table — INSERT -----------------------------------------
  if (s.startsWith('INSERT') && s.includes('LOBSTER_MIGRATIONS')) {
    const name = String(params[0]);
    if (!ctx.migrations.has(name)) {
      ctx.migrations.set(name, { id: ctx.migrations.size + 1, name, executedAt: new Date() });
    }
    return makeQueryResult([], 1);
  }

  // ---- migrations table — DELETE -----------------------------------------
  if (s.startsWith('DELETE') && s.includes('LOBSTER_MIGRATIONS')) {
    const name = String(params[0]);
    const existed = ctx.migrations.delete(name);
    return makeQueryResult([], existed ? 1 : 0);
  }

  // ---- kv table — SELECT COUNT(*) ----------------------------------------
  if (s.startsWith('SELECT') && s.includes('COUNT(*)')) {
    let count = 0;
    // prefix pattern is the first string param ending with '%'
    const patternParam = params.find((p) => typeof p === 'string' && (p as string).endsWith('%'));
    const prefix = patternParam !== undefined
      ? String(patternParam).slice(0, -1)  // strip trailing %
      : null;

    for (const [key, entry] of ctx.store) {
      if (isExpired(entry)) continue;
      if (prefix !== null && !key.startsWith(prefix)) continue;
      count++;
    }
    return makeQueryResult([{ total: String(count) }]);
  }

  // ---- kv table — SELECT … IN (…) — getMany() ----------------------------
  if (s.startsWith('SELECT') && s.includes(' IN (')) {
    const rows: Array<{ key: string; value: unknown; expires_at: Date | null }> = [];
    for (const p of params) {
      const key = String(p);
      const entry = ctx.store.get(key);
      if (entry !== undefined && !isExpired(entry)) {
        rows.push({ key, value: entry.value, expires_at: entry.expiresAt });
      }
    }
    return makeQueryResult(rows);
  }

  // ---- kv table — SELECT single key — get() ------------------------------
  // Detected by: exactly 1 param that is a string, no LIKE / LIMIT / OFFSET
  if (
    s.startsWith('SELECT') &&
    params.length === 1 &&
    typeof params[0] === 'string' &&
    !s.includes('LIKE') &&
    !s.includes('LIMIT') &&
    !s.includes('OFFSET')
  ) {
    const key = String(params[0]);
    const entry = ctx.store.get(key);
    if (entry === undefined || isExpired(entry)) return makeQueryResult([]);
    return makeQueryResult([{ key, value: entry.value, expires_at: entry.expiresAt }]);
  }

  // ---- kv table — SELECT rows — query() ----------------------------------
  // May have: LIKE pattern (string ending %), LIMIT (number), OFFSET (number)
  if (s.startsWith('SELECT') && s.includes('FROM')) {
    let rows = [...ctx.store.entries()]
      .filter(([, entry]) => !isExpired(entry))
      .map(([key, entry]) => ({ key, value: entry.value, expires_at: entry.expiresAt }));

    // Apply prefix filter
    const likeParam = params.find((p) => typeof p === 'string' && (p as string).endsWith('%'));
    if (likeParam !== undefined) {
      const prefix = String(likeParam).slice(0, -1);
      rows = rows.filter((r) => r.key.startsWith(prefix));
    }

    // Sort by key
    rows.sort((a, b) => a.key.localeCompare(b.key));

    // Extract numeric params in order (LIMIT then OFFSET based on SQL keywords)
    const numericParams = params.filter((p) => typeof p === 'number').map(Number);
    let limitVal: number | undefined;
    let offsetVal = 0;

    if (s.includes('OFFSET') && numericParams.length >= 2) {
      limitVal = numericParams[0];
      offsetVal = numericParams[1] ?? 0;
    } else if (s.includes('LIMIT') && numericParams.length >= 1) {
      limitVal = numericParams[0];
    } else if (s.includes('OFFSET') && numericParams.length === 1) {
      offsetVal = numericParams[0] ?? 0;
    }

    rows = rows.slice(offsetVal);
    if (limitVal !== undefined) rows = rows.slice(0, limitVal);

    return makeQueryResult(rows);
  }

  // ---- kv table — INSERT / UPSERT — set() / setMany() -------------------
  if (s.startsWith('INSERT') && s.includes('ON CONFLICT')) {
    const key = String(params[0]);
    const rawValue = params[1];
    const expiresAtParam = params[2] ?? null;

    const value: unknown =
      typeof rawValue === 'string' ? (JSON.parse(rawValue) as unknown) : rawValue;

    let expiresAt: Date | null = null;
    if (expiresAtParam instanceof Date) {
      expiresAt = expiresAtParam;
    } else if (typeof expiresAtParam === 'string' && expiresAtParam !== 'null') {
      expiresAt = new Date(expiresAtParam);
    }

    const existing = ctx.store.get(key);
    ctx.store.set(key, {
      value,
      expiresAt,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
    return makeQueryResult([], 1);
  }

  // ---- kv table — DELETE — delete() / purgeExpired() --------------------
  if (s.startsWith('DELETE')) {
    if (params.length === 0) {
      // purgeExpired — no params
      for (const [key, entry] of ctx.store) {
        if (isExpired(entry)) ctx.store.delete(key);
      }
      return makeQueryResult([], 0);
    }
    const key = String(params[0]);
    const existed = ctx.store.delete(key);
    return makeQueryResult([], existed ? 1 : 0);
  }

  // Fallback
  return makeQueryResult([], 0);
}

// ---------------------------------------------------------------------------
// createMockPool
// ---------------------------------------------------------------------------

function createMockPool(): {
  pool: Pool;
  store: Map<string, KvEntry>;
  migrations: Map<string, MigrationEntry>;
} {
  const store = new Map<string, KvEntry>();
  const migrations = new Map<string, MigrationEntry>();
  const ctx: DispatchCtx = { store, migrations };

  const makeClient = (): PoolClient => {
    const client = {
      query: vi.fn((sql: string, params: unknown[] = []) => {
        return Promise.resolve(dispatch(sql, params, ctx));
      }),
      release: vi.fn(),
    };
    return client as unknown as PoolClient;
  };

  const pool = {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      return Promise.resolve(dispatch(sql, params, ctx));
    }),
    connect: vi.fn(() => Promise.resolve(makeClient())),
    end: vi.fn(() => Promise.resolve()),
  } as unknown as Pool;

  return { pool, store, migrations };
}

// ---------------------------------------------------------------------------
// TestablePostgresProvider — injects a mock Pool to bypass real PG
// ---------------------------------------------------------------------------

class TestablePostgresProvider extends PostgresProvider {
  private readonly injectedPool: Pool;

  constructor(pool: Pool) {
    super({});
    this.injectedPool = pool;
  }

  override async connect(): Promise<void> {
    // Inject pool via the private field name used internally
    (this as unknown as { pool: Pool }).pool = this.injectedPool;

    const runner = new MigrationRunner(this.injectedPool);
    await runner.run();
  }
}

// ---------------------------------------------------------------------------
// Test suite — PostgresProvider
// ---------------------------------------------------------------------------

describe('PostgresProvider', () => {
  let pool: Pool;
  let store: Map<string, KvEntry>;
  let provider: TestablePostgresProvider;

  beforeEach(async () => {
    const mock = createMockPool();
    pool = mock.pool;
    store = mock.store;
    provider = new TestablePostgresProvider(pool);
    await provider.connect();
  });

  afterEach(async () => {
    await provider.disconnect();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // health()
  // -------------------------------------------------------------------------

  describe('health()', () => {
    it('returns true when connected', async () => {
      expect(await provider.health()).toBe(true);
    });

    it('returns false when never connected', async () => {
      const fresh = new PostgresProvider({});
      expect(await fresh.health()).toBe(false);
    });

    it('returns false after disconnect()', async () => {
      await provider.disconnect();
      expect(await provider.health()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // get() / set()
  // -------------------------------------------------------------------------

  describe('get() / set()', () => {
    it('returns null for a missing key', async () => {
      expect(await provider.get('missing')).toBeNull();
    });

    it('stores and retrieves a string value', async () => {
      await provider.set('hello', 'world');
      expect(await provider.get('hello')).toBe('world');
    });

    it('stores and retrieves a complex object', async () => {
      const payload = { id: 1, tags: ['a', 'b'], nested: { x: true } };
      await provider.set('obj', payload);
      expect(await provider.get('obj')).toEqual(payload);
    });

    it('stores and retrieves a numeric value', async () => {
      await provider.set('num', 42);
      expect(await provider.get<number>('num')).toBe(42);
    });

    it('stores boolean false', async () => {
      await provider.set('flag', false);
      expect(await provider.get<boolean>('flag')).toBe(false);
    });

    it('overwrites an existing key with the new value', async () => {
      await provider.set('key', 'first');
      await provider.set('key', 'second');
      expect(await provider.get('key')).toBe('second');
    });
  });

  // -------------------------------------------------------------------------
  // TTL expiration
  // -------------------------------------------------------------------------

  describe('TTL expiration', () => {
    it('returns value when TTL has not elapsed', async () => {
      await provider.set('live', 'alive', 3600);
      expect(await provider.get('live')).toBe('alive');
    });

    it('returns null for an already-expired entry', async () => {
      store.set('expired', {
        value: 'gone',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(await provider.get('expired')).toBeNull();
    });

    it('excludes expired keys from getMany()', async () => {
      await provider.set('live', 'yes', 3600);
      store.set('dead', {
        value: 'no',
        expiresAt: new Date(Date.now() - 500),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await provider.getMany(['live', 'dead']);
      expect(result.has('dead')).toBe(false);
      expect(result.get('live')).toBe('yes');
    });

    it('excludes expired keys from query()', async () => {
      await provider.set('user:1', { id: 1 });
      store.set('user:expired', {
        value: { id: 99 },
        expiresAt: new Date(Date.now() - 500),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const results = await provider.query<{ id: number }>({ prefix: 'user:' });
      expect(results.map((r) => r.id)).not.toContain(99);
    });

    it('excludes expired keys from count()', async () => {
      await provider.set('ns:a', 1);
      store.set('ns:expired', {
        value: 2,
        expiresAt: new Date(Date.now() - 500),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(await provider.count({ prefix: 'ns:' })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete()', () => {
    it('returns true when the key existed', async () => {
      await provider.set('del-me', 'value');
      expect(await provider.delete('del-me')).toBe(true);
    });

    it('returns false when the key does not exist', async () => {
      expect(await provider.delete('no-such-key')).toBe(false);
    });

    it('makes the key unretrievable after deletion', async () => {
      await provider.set('gone', 'value');
      await provider.delete('gone');
      expect(await provider.get('gone')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getMany()
  // -------------------------------------------------------------------------

  describe('getMany()', () => {
    it('returns an empty Map when keys array is empty', async () => {
      expect((await provider.getMany([])).size).toBe(0);
    });

    it('returns only keys that exist', async () => {
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
  });

  // -------------------------------------------------------------------------
  // setMany()
  // -------------------------------------------------------------------------

  describe('setMany()', () => {
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

    it('overwrites existing keys', async () => {
      await provider.set('dup', 'old');
      await provider.setMany(new Map([['dup', 'new']]));
      expect(await provider.get('dup')).toBe('new');
    });

    it('uses a transaction — pool.connect() is called', async () => {
      await provider.setMany(new Map([['txn-key', 'val']]));
      expect(pool.connect).toHaveBeenCalled();
    });

    it('stores entries with TTL — expires_at is set in the past for ttl=-1', async () => {
      const before = new Date(Date.now() - 1000);
      await provider.setMany(new Map([['ttl-key', 'val']]), -1);

      const entry = store.get('ttl-key');
      expect(entry).toBeDefined();
      expect(entry?.expiresAt).not.toBeNull();
      // expiresAt should be at or before 'before' + 2s tolerance
      expect(entry!.expiresAt!.getTime()).toBeLessThanOrEqual(before.getTime() + 2000);
    });
  });

  // -------------------------------------------------------------------------
  // query()
  // -------------------------------------------------------------------------

  describe('query()', () => {
    beforeEach(async () => {
      await provider.set('user:1', { id: 1 });
      await provider.set('user:2', { id: 2 });
      await provider.set('user:3', { id: 3 });
      await provider.set('config:timeout', 30);
      await provider.set('config:retries', 5);
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
      expect(paged.length).toBe(all.length - 2);
    });

    it('combines prefix with limit and offset', async () => {
      const results = await provider.query({ prefix: 'user:', limit: 2, offset: 1 });
      expect(results.length).toBe(2);
    });

    it('excludes expired entries', async () => {
      store.set('user:expired', {
        value: { id: 99 },
        expiresAt: new Date(Date.now() - 500),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const results = await provider.query<{ id: number }>({ prefix: 'user:' });
      expect(results.map((r) => r.id)).not.toContain(99);
    });
  });

  // -------------------------------------------------------------------------
  // count()
  // -------------------------------------------------------------------------

  describe('count()', () => {
    beforeEach(async () => {
      await provider.set('ns:a', 1);
      await provider.set('ns:b', 2);
      await provider.set('other:c', 3);
    });

    it('returns total entry count with no filter', async () => {
      expect(await provider.count({})).toBe(3);
    });

    it('returns 0 when the store is empty', async () => {
      const mock2 = createMockPool();
      const p2 = new TestablePostgresProvider(mock2.pool);
      await p2.connect();
      expect(await p2.count({})).toBe(0);
      await p2.disconnect();
    });

    it('returns count matching the prefix', async () => {
      expect(await provider.count({ prefix: 'ns:' })).toBe(2);
    });

    it('returns 0 when no keys match the prefix', async () => {
      expect(await provider.count({ prefix: 'xyz:' })).toBe(0);
    });

    it('excludes expired entries from the count', async () => {
      store.set('ns:expired', {
        value: 'val',
        expiresAt: new Date(Date.now() - 500),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(await provider.count({ prefix: 'ns:' })).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling — operations without connect()
  // -------------------------------------------------------------------------

  describe('error handling — not connected', () => {
    let fresh: PostgresProvider;

    beforeEach(() => {
      fresh = new PostgresProvider({});
    });

    it('get() throws when not connected', async () => {
      await expect(fresh.get('key')).rejects.toThrow(/not connected/i);
    });

    it('set() throws when not connected', async () => {
      await expect(fresh.set('key', 'val')).rejects.toThrow(/not connected/i);
    });

    it('delete() throws when not connected', async () => {
      await expect(fresh.delete('key')).rejects.toThrow(/not connected/i);
    });

    it('getMany() throws when not connected', async () => {
      await expect(fresh.getMany(['key'])).rejects.toThrow(/not connected/i);
    });

    it('setMany() throws when not connected', async () => {
      await expect(fresh.setMany(new Map([['k', 'v']]))).rejects.toThrow(
        /not connected/i
      );
    });

    it('query() throws when not connected', async () => {
      await expect(fresh.query({})).rejects.toThrow(/not connected/i);
    });

    it('count() throws when not connected', async () => {
      await expect(fresh.count({})).rejects.toThrow(/not connected/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Test suite — MigrationRunner
// ---------------------------------------------------------------------------

describe('MigrationRunner', () => {
  let pool: Pool;
  let migrations: Map<string, MigrationEntry>;
  let runner: MigrationRunner;

  beforeEach(() => {
    const mock = createMockPool();
    pool = mock.pool;
    migrations = mock.migrations;
    runner = new MigrationRunner(pool);
  });

  it('run() executes pending migrations', async () => {
    await runner.run();
    expect(migrations.size).toBeGreaterThan(0);
  });

  it('run() is idempotent — calling twice does not duplicate migrations', async () => {
    await runner.run();
    const sizeAfterFirst = migrations.size;
    await runner.run();
    expect(migrations.size).toBe(sizeAfterFirst);
  });

  it('status() returns all known migrations', async () => {
    const statuses = await runner.status();
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.pending).toBe('boolean');
    }
  });

  it('status() marks all migrations as not pending after run()', async () => {
    await runner.run();
    const statuses = await runner.status();
    for (const s of statuses) {
      expect(s.pending).toBe(false);
    }
  });

  it('status() marks all migrations as pending before run()', async () => {
    const statuses = await runner.status();
    for (const s of statuses) {
      expect(s.pending).toBe(true);
    }
  });

  it('rollback() removes the last applied migration tracking record', async () => {
    await runner.run();
    const sizeBefore = migrations.size;
    await runner.rollback(1);
    expect(migrations.size).toBe(sizeBefore - 1);
  });

  it('rollback() with count=0 removes no records', async () => {
    await runner.run();
    const sizeBefore = migrations.size;
    await runner.rollback(0);
    expect(migrations.size).toBe(sizeBefore);
  });

  it('after rollback, run() re-applies the rolled-back migration', async () => {
    await runner.run();
    await runner.rollback(1);
    await runner.run();
    // Should be back to original size
    const statuses = await runner.status();
    expect(statuses.every((s) => !s.pending)).toBe(true);
  });
});

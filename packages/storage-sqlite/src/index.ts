// @lobster-engine/storage-sqlite
// SQLite storage provider — default zero-dependency backend

import Database from 'better-sqlite3';
import type { QueryFilter, StorageProvider } from '@lobster-engine/core';

export interface SQLiteConfig {
  /** Path to the SQLite database file. Defaults to :memory: */
  path?: string;
}

interface KvRow {
  key: string;
  value: string;
  ttl: number | null;
  created_at: number;
}

export class SQLiteProvider implements StorageProvider {
  readonly name = 'sqlite';
  private readonly config: SQLiteConfig;
  private db: Database.Database | null = null;

  constructor(config: SQLiteConfig = {}) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const filePath = this.config.path ?? ':memory:';
    this.db = new Database(filePath);
    // WAL mode for concurrent reads
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT    PRIMARY KEY,
        value      TEXT    NOT NULL,
        ttl        INTEGER,
        created_at INTEGER NOT NULL
      )
    `);
  }

  async disconnect(): Promise<void> {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
  }

  async health(): Promise<boolean> {
    try {
      if (this.db === null) return false;
      const result = this.db.prepare('SELECT 1 AS ok').get() as { ok: number };
      return result.ok === 1;
    } catch {
      return false;
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const db = this.requireDb();
    const row = db.prepare<[string], KvRow>(
      'SELECT key, value, ttl, created_at FROM kv WHERE key = ?'
    ).get(key);

    if (row === undefined) return null;
    if (this.isExpired(row)) {
      db.prepare('DELETE FROM kv WHERE key = ?').run(key);
      return null;
    }

    return JSON.parse(row.value) as T;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const db = this.requireDb();
    const now = Date.now();
    const ttlMs = ttl !== undefined ? ttl * 1000 : null;
    db.prepare(
      'INSERT OR REPLACE INTO kv (key, value, ttl, created_at) VALUES (?, ?, ?, ?)'
    ).run(key, JSON.stringify(value), ttlMs, now);
  }

  async delete(key: string): Promise<boolean> {
    const db = this.requireDb();
    const info = db.prepare('DELETE FROM kv WHERE key = ?').run(key);
    return info.changes > 0;
  }

  async getMany<T = unknown>(keys: readonly string[]): Promise<Map<string, T>> {
    if (keys.length === 0) return new Map();
    const db = this.requireDb();
    const placeholders = keys.map(() => '?').join(', ');
    const rows = db
      .prepare<string[], KvRow>(
        `SELECT key, value, ttl, created_at FROM kv WHERE key IN (${placeholders})`
      )
      .all(...keys);

    const now = Date.now();
    const expiredKeys: string[] = [];
    const result = new Map<string, T>();

    for (const row of rows) {
      if (this.isExpiredAt(row, now)) {
        expiredKeys.push(row.key);
      } else {
        result.set(row.key, JSON.parse(row.value) as T);
      }
    }

    if (expiredKeys.length > 0) {
      const delPlaceholders = expiredKeys.map(() => '?').join(', ');
      db.prepare(`DELETE FROM kv WHERE key IN (${delPlaceholders})`).run(
        ...expiredKeys
      );
    }

    return result;
  }

  async setMany<T = unknown>(
    entries: ReadonlyMap<string, T>,
    ttl?: number
  ): Promise<void> {
    if (entries.size === 0) return;
    const db = this.requireDb();
    const now = Date.now();
    const ttlMs = ttl !== undefined ? ttl * 1000 : null;
    const insert = db.prepare(
      'INSERT OR REPLACE INTO kv (key, value, ttl, created_at) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction(
      (pairs: ReadonlyArray<readonly [string, T]>) => {
        for (const [k, v] of pairs) {
          insert.run(k, JSON.stringify(v), ttlMs, now);
        }
      }
    );
    insertMany([...entries.entries()]);
  }

  async query<T = unknown>(filter: QueryFilter): Promise<readonly T[]> {
    const db = this.requireDb();
    const now = Date.now();

    let sql = 'SELECT key, value, ttl, created_at FROM kv WHERE 1=1';
    const params: Array<string | number> = [];

    if (filter.prefix !== undefined && filter.prefix !== '') {
      sql += ' AND key LIKE ?';
      params.push(`${escapeLike(filter.prefix)}%`);
    }

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? -1;
    sql += ' ORDER BY key ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare<Array<string | number>, KvRow>(sql).all(...params);
    const result: T[] = [];

    for (const row of rows) {
      if (!this.isExpiredAt(row, now)) {
        result.push(JSON.parse(row.value) as T);
      }
    }

    return result;
  }

  async count(filter: QueryFilter): Promise<number> {
    const db = this.requireDb();
    const now = Date.now();

    // For accurate count with TTL we need to load rows (no COUNT(*) shortcut when TTL matters)
    let sql = 'SELECT ttl, created_at FROM kv WHERE 1=1';
    const params: Array<string | number> = [];

    if (filter.prefix !== undefined && filter.prefix !== '') {
      sql += ' AND key LIKE ?';
      params.push(`${escapeLike(filter.prefix)}%`);
    }

    const rows = db
      .prepare<Array<string | number>, Pick<KvRow, 'ttl' | 'created_at'>>(sql)
      .all(...params);

    let count = 0;
    for (const row of rows) {
      if (!this.isExpiredAt(row, now)) count++;
    }
    return count;
  }

  // --- private helpers ---

  private requireDb(): Database.Database {
    if (this.db === null) {
      throw new Error('SQLiteProvider: not connected. Call connect() first.');
    }
    return this.db;
  }

  private isExpired(row: Pick<KvRow, 'ttl' | 'created_at'>): boolean {
    return this.isExpiredAt(row, Date.now());
  }

  private isExpiredAt(
    row: Pick<KvRow, 'ttl' | 'created_at'>,
    now: number
  ): boolean {
    if (row.ttl === null) return false;
    return now > row.created_at + row.ttl;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

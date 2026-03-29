// @lobster-engine/storage-postgres — PostgreSQL storage provider

import { Pool, type PoolClient } from 'pg';
import type { QueryFilter, StorageProvider } from '@lobster-engine/core';
import { MigrationRunner } from './migrations.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PostgresConfig {
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
  readonly connectionString?: string;
  readonly maxConnections?: number;
  readonly ssl?: boolean;
  readonly schema?: string;
  readonly tablePrefix?: string;
}

// ---------------------------------------------------------------------------
// Internal row shape returned by pg
// ---------------------------------------------------------------------------

interface KvRow {
  key: string;
  value: unknown;
  expires_at: Date | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function tableName(config: PostgresConfig): string {
  const schema = config.schema ?? 'public';
  const prefix = config.tablePrefix ?? 'lobster_';
  return `"${schema}"."${prefix}kv"`;
}

function migrationsTable(config: PostgresConfig): string {
  const schema = config.schema ?? 'public';
  const prefix = config.tablePrefix ?? 'lobster_';
  return `"${schema}"."${prefix}migrations"`;
}

// ---------------------------------------------------------------------------
// PostgresProvider
// ---------------------------------------------------------------------------

export class PostgresProvider implements StorageProvider {
  readonly name = 'postgres';
  private readonly config: PostgresConfig;
  private pool: Pool | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: PostgresConfig = {}) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(): Promise<void> {
    const { connectionString, host, port, database, user, password, maxConnections, ssl } =
      this.config;

    this.pool = new Pool(
      connectionString !== undefined
        ? {
            connectionString,
            max: maxConnections ?? 10,
            ssl: ssl === true ? { rejectUnauthorized: true } : undefined,
          }
        : {
            host: host ?? '127.0.0.1',
            port: port ?? 5432,
            database: database ?? 'postgres',
            user,
            password,
            max: maxConnections ?? 10,
            ssl: ssl === true ? { rejectUnauthorized: true } : undefined,
          }
    );

    // Run schema migrations
    const runner = new MigrationRunner(this.pool, {
      kvTable: tableName(this.config),
      migrationsTable: migrationsTable(this.config),
    });
    await runner.run();

    // Periodic cleanup of expired rows — every 60 seconds
    this.cleanupTimer = setInterval(() => {
      void this.purgeExpired();
    }, 60_000);
  }

  async disconnect(): Promise<void> {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.pool !== null) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async health(): Promise<boolean> {
    try {
      const pool = this.pool;
      if (pool === null) return false;
      const result = await pool.query<{ ok: number }>('SELECT 1 AS ok');
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async get<T = unknown>(key: string): Promise<T | null> {
    const pool = this.requirePool();
    const table = tableName(this.config);

    const result = await pool.query<KvRow>(
      `SELECT key, value, expires_at
       FROM ${table}
       WHERE key = $1
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    );

    const row = result.rows[0];
    if (row === undefined) return null;
    return row.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const pool = this.requirePool();
    const table = tableName(this.config);
    const expiresAt = ttl !== undefined ? new Date(Date.now() + ttl * 1000) : null;

    await pool.query(
      `INSERT INTO ${table} (key, value, expires_at, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value      = EXCLUDED.value,
             expires_at = EXCLUDED.expires_at,
             updated_at = NOW()`,
      [key, JSON.stringify(value), expiresAt]
    );
  }

  async delete(key: string): Promise<boolean> {
    const pool = this.requirePool();
    const table = tableName(this.config);

    const result = await pool.query(
      `DELETE FROM ${table} WHERE key = $1`,
      [key]
    );

    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // Batch operations
  // -------------------------------------------------------------------------

  async getMany<T = unknown>(keys: readonly string[]): Promise<Map<string, T>> {
    if (keys.length === 0) return new Map();
    const pool = this.requirePool();
    const table = tableName(this.config);

    // Build $1, $2, ... placeholders
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const result = await pool.query<KvRow>(
      `SELECT key, value, expires_at
       FROM ${table}
       WHERE key IN (${placeholders})
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [...keys]
    );

    const map = new Map<string, T>();
    for (const row of result.rows) {
      map.set(row.key, row.value as T);
    }
    return map;
  }

  async setMany<T = unknown>(
    entries: ReadonlyMap<string, T>,
    ttl?: number
  ): Promise<void> {
    if (entries.size === 0) return;
    const pool = this.requirePool();
    const table = tableName(this.config);
    const expiresAt = ttl !== undefined ? new Date(Date.now() + ttl * 1000) : null;

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO ${table} (key, value, expires_at, updated_at)
           VALUES ($1, $2::jsonb, $3, NOW())
           ON CONFLICT (key) DO UPDATE
             SET value      = EXCLUDED.value,
                 expires_at = EXCLUDED.expires_at,
                 updated_at = NOW()`,
          [key, JSON.stringify(value), expiresAt]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Query / Count
  // -------------------------------------------------------------------------

  async query<T = unknown>(filter: QueryFilter): Promise<readonly T[]> {
    const pool = this.requirePool();
    const table = tableName(this.config);

    const params: Array<string | number | Date> = [];
    let sql =
      `SELECT key, value FROM ${table}` +
      ` WHERE (expires_at IS NULL OR expires_at > NOW())`;

    if (filter.prefix !== undefined && filter.prefix !== '') {
      params.push(`${escapeLike(filter.prefix)}%`);
      sql += ` AND key LIKE $${params.length} ESCAPE '\\'`;
    }

    sql += ' ORDER BY key ASC';

    if (filter.limit !== undefined) {
      params.push(filter.limit);
      sql += ` LIMIT $${params.length}`;
    }

    if (filter.offset !== undefined && filter.offset > 0) {
      params.push(filter.offset);
      sql += ` OFFSET $${params.length}`;
    }

    const result = await pool.query<KvRow>(sql, params);
    return result.rows.map((row) => row.value as T);
  }

  async count(filter: QueryFilter): Promise<number> {
    const pool = this.requirePool();
    const table = tableName(this.config);

    const params: Array<string> = [];
    let sql =
      `SELECT COUNT(*) AS total FROM ${table}` +
      ` WHERE (expires_at IS NULL OR expires_at > NOW())`;

    if (filter.prefix !== undefined && filter.prefix !== '') {
      params.push(`${escapeLike(filter.prefix)}%`);
      sql += ` AND key LIKE $${params.length} ESCAPE '\\'`;
    }

    const result = await pool.query<{ total: string }>(sql, params);
    return parseInt(result.rows[0]?.total ?? '0', 10);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requirePool(): Pool {
    if (this.pool === null) {
      throw new Error('PostgresProvider: not connected. Call connect() first.');
    }
    return this.pool;
  }

  private async purgeExpired(): Promise<void> {
    try {
      if (this.pool === null) return;
      const table = tableName(this.config);
      await this.pool.query(
        `DELETE FROM ${table} WHERE expires_at IS NOT NULL AND expires_at <= NOW()`
      );
    } catch {
      // Background cleanup — swallow errors silently to avoid crashing the process
    }
  }
}

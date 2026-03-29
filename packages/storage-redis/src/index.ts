// @lobster-engine/storage-redis
// Redis storage provider — production hot-state backend

import Redis, { type RedisOptions } from 'ioredis';
import type { QueryFilter, StorageProvider } from '@lobster-engine/core';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  /** Key prefix applied to every operation. Defaults to "lobster:". */
  keyPrefix?: string;
  /** Extra ioredis options forwarded verbatim to the Redis constructor. */
  connectionOptions?: RedisOptions;
}

export class RedisProvider implements StorageProvider {
  readonly name = 'redis';
  private readonly config: RedisConfig;
  private client: Redis | null = null;

  constructor(config: RedisConfig = {}) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.client = this.buildClient();
    // Eagerly ping to surface connection errors early
    await this.client.ping();
  }

  async disconnect(): Promise<void> {
    if (this.client !== null) {
      await this.client.quit();
      this.client = null;
    }
  }

  async health(): Promise<boolean> {
    try {
      if (this.client === null) return false;
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const client = this.requireClient();
    const raw = await client.get(this.prefix(key));
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const client = this.requireClient();
    const serialized = JSON.stringify(value);
    if (ttl !== undefined) {
      // EX is seconds — Redis native TTL
      await client.set(this.prefix(key), serialized, 'EX', ttl);
    } else {
      await client.set(this.prefix(key), serialized);
    }
  }

  async delete(key: string): Promise<boolean> {
    const client = this.requireClient();
    const deleted = await client.del(this.prefix(key));
    return deleted > 0;
  }

  async getMany<T = unknown>(
    keys: readonly string[]
  ): Promise<Map<string, T>> {
    if (keys.length === 0) return new Map();
    const client = this.requireClient();
    const prefixedKeys = keys.map((k) => this.prefix(k));
    const values = await client.mget(...prefixedKeys);

    const result = new Map<string, T>();
    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (raw !== null && raw !== undefined) {
        result.set(keys[i] as string, JSON.parse(raw) as T);
      }
    }
    return result;
  }

  async setMany<T = unknown>(
    entries: ReadonlyMap<string, T>,
    ttl?: number
  ): Promise<void> {
    if (entries.size === 0) return;
    const client = this.requireClient();
    const pipeline = client.pipeline();

    for (const [key, value] of entries) {
      const serialized = JSON.stringify(value);
      if (ttl !== undefined) {
        pipeline.set(this.prefix(key), serialized, 'EX', ttl);
      } else {
        pipeline.set(this.prefix(key), serialized);
      }
    }

    const results = await pipeline.exec();
    if (results === null) return;

    for (const [err] of results) {
      if (err !== null) {
        throw new Error(`RedisProvider.setMany pipeline error: ${String(err)}`);
      }
    }
  }

  async query<T = unknown>(filter: QueryFilter): Promise<readonly T[]> {
    const client = this.requireClient();
    const pattern = this.buildScanPattern(filter.prefix);

    const matchedKeys = await this.scanKeys(client, pattern);

    const offset = filter.offset ?? 0;
    const limit = filter.limit;

    const sliced =
      limit !== undefined
        ? matchedKeys.slice(offset, offset + limit)
        : matchedKeys.slice(offset);

    if (sliced.length === 0) return [];

    const values = await client.mget(...sliced);
    const result: T[] = [];

    for (const raw of values) {
      if (raw !== null && raw !== undefined) {
        result.push(JSON.parse(raw) as T);
      }
    }
    return result;
  }

  async count(filter: QueryFilter): Promise<number> {
    const client = this.requireClient();
    const pattern = this.buildScanPattern(filter.prefix);
    const keys = await this.scanKeys(client, pattern);
    const offset = filter.offset ?? 0;
    const available = Math.max(0, keys.length - offset);
    return filter.limit !== undefined
      ? Math.min(available, filter.limit)
      : available;
  }

  // --- private helpers ---

  private buildClient(): Redis {
    const { url, host, port, password, db, connectionOptions } = this.config;
    const extra: RedisOptions = { ...connectionOptions, lazyConnect: true };

    if (url !== undefined) {
      return new Redis(url, extra);
    }

    return new Redis({
      host: host ?? '127.0.0.1',
      port: port ?? 6379,
      password,
      db: db ?? 0,
      ...extra,
    });
  }

  private requireClient(): Redis {
    if (this.client === null) {
      throw new Error('RedisProvider: not connected. Call connect() first.');
    }
    return this.client;
  }

  private prefix(key: string): string {
    const p = this.config.keyPrefix ?? 'lobster:';
    return `${p}${key}`;
  }

  private buildScanPattern(prefix?: string): string {
    const keyPrefix = this.config.keyPrefix ?? 'lobster:';
    if (prefix !== undefined && prefix !== '') {
      return `${keyPrefix}${escapeScanGlob(prefix)}*`;
    }
    return `${keyPrefix}*`;
  }

  private async scanKeys(client: Redis, pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }
}

function escapeScanGlob(value: string): string {
  return value.replace(/[*?[\]\\]/g, (c) => `\\${c}`);
}

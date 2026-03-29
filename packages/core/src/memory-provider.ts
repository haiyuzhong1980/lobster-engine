// @lobster-engine/core — MemoryProvider
// Simple Map-based StorageProvider for testing.

import type { QueryFilter, StorageProvider } from './storage.js';

interface Entry<T> {
  readonly value: T;
  /** Absolute epoch ms at which this entry expires, or undefined if no TTL. */
  readonly expiresAt: number | undefined;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
}

export class MemoryProvider implements StorageProvider {
  readonly name = 'memory';
  private readonly store = new Map<string, Entry<unknown>>();
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // Cancel all pending timers and clear store
    for (const entry of this.store.values()) {
      if (entry.timer !== undefined) clearTimeout(entry.timer);
    }
    this.store.clear();
    this.connected = false;
  }

  async health(): Promise<boolean> {
    return this.connected;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as Entry<T> | undefined;
    if (entry === undefined) return null;
    if (this.isExpired(entry)) {
      this.evict(key, entry);
      return null;
    }
    return entry.value;
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    // Cancel existing timer for this key if any
    const existing = this.store.get(key);
    if (existing?.timer !== undefined) clearTimeout(existing.timer);

    let expiresAt: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (ttl !== undefined) {
      expiresAt = Date.now() + ttl * 1000;
      timer = setTimeout(() => {
        this.store.delete(key);
      }, ttl * 1000);
      // Allow the process to exit even if timers are pending
      if (typeof timer === 'object' && 'unref' in timer) {
        (timer as { unref(): void }).unref();
      }
    }

    this.store.set(key, { value, expiresAt, timer });
  }

  async delete(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry === undefined) return false;
    this.evict(key, entry);
    return true;
  }

  async getMany<T = unknown>(
    keys: readonly string[]
  ): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== null) result.set(key, value);
    }
    return result;
  }

  async setMany<T = unknown>(
    entries: ReadonlyMap<string, T>,
    ttl?: number
  ): Promise<void> {
    for (const [key, value] of entries) {
      await this.set(key, value, ttl);
    }
  }

  async query<T = unknown>(filter: QueryFilter): Promise<readonly T[]> {
    const now = Date.now();
    const offset = filter.offset ?? 0;
    const limit = filter.limit;

    const results: T[] = [];
    let skipped = 0;

    for (const [key, entry] of this.store) {
      if (this.isExpiredAt(entry, now)) continue;
      if (filter.prefix !== undefined && !key.startsWith(filter.prefix)) {
        continue;
      }
      if (skipped < offset) {
        skipped++;
        continue;
      }
      if (limit !== undefined && results.length >= limit) break;
      results.push(entry.value as T);
    }

    return results;
  }

  async count(filter: QueryFilter): Promise<number> {
    const now = Date.now();
    const offset = filter.offset ?? 0;
    const limit = filter.limit;

    let total = 0;
    for (const [key, entry] of this.store) {
      if (this.isExpiredAt(entry, now)) continue;
      if (filter.prefix !== undefined && !key.startsWith(filter.prefix)) {
        continue;
      }
      total++;
    }

    const available = Math.max(0, total - offset);
    return limit !== undefined ? Math.min(available, limit) : available;
  }

  // --- private helpers ---

  private isExpired(entry: Entry<unknown>): boolean {
    return this.isExpiredAt(entry, Date.now());
  }

  private isExpiredAt(entry: Entry<unknown>, now: number): boolean {
    return entry.expiresAt !== undefined && now >= entry.expiresAt;
  }

  private evict(key: string, entry: Entry<unknown>): void {
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    this.store.delete(key);
  }
}

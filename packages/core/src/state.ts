// @lobster-engine/core — StateManager

import type { BotState } from './types.js';
import type { StorageProvider } from './storage.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type StateTier = 'hot' | 'warm' | 'cold';

export interface StateManagerConfig {
  /** Fast storage — Redis in prod, MemoryStorageProvider in dev */
  readonly hotStorage: StorageProvider;
  /** Optional mid-tier storage; falls back to hotStorage when absent */
  readonly warmStorage?: StorageProvider;
  /** Optional durable cold storage for history */
  readonly coldStorage?: StorageProvider;
  /** Hot-tier TTL in seconds (default: 3600) */
  readonly hotTtl?: number;
  /** Warm-tier TTL in seconds (default: 86400) */
  readonly warmTtl?: number;
}

// ---------------------------------------------------------------------------
// Key helpers (pure functions, no mutation)
// ---------------------------------------------------------------------------

const botKey = (botId: string): string => `bot:state:${botId}`;
const sceneKey = (sceneId: string, key: string): string =>
  `scene:state:${sceneId}:${key}`;

// ---------------------------------------------------------------------------
// StateManager
// ---------------------------------------------------------------------------

export class StateManager {
  private readonly hotStorage: StorageProvider;
  private readonly warmStorage: StorageProvider | undefined;
  private readonly coldStorage: StorageProvider | undefined;
  private readonly hotTtl: number;
  private readonly warmTtl: number;

  constructor(config: StateManagerConfig) {
    this.hotStorage = config.hotStorage;
    this.warmStorage = config.warmStorage;
    this.coldStorage = config.coldStorage;
    this.hotTtl = config.hotTtl ?? 3600;
    this.warmTtl = config.warmTtl ?? 86400;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async connect(): Promise<void> {
    const stores = this.allStores();
    await Promise.all(stores.map((s) => s.connect()));
  }

  async disconnect(): Promise<void> {
    const stores = this.allStores();
    await Promise.all(stores.map((s) => s.disconnect()));
  }

  // -------------------------------------------------------------------------
  // Bot state
  // -------------------------------------------------------------------------

  async getBotState(botId: string): Promise<BotState | null> {
    const key = botKey(botId);

    // Walk hot → warm → cold, returning the first hit
    const hotResult = await this.hotStorage.get<BotState>(key);
    if (hotResult !== null) return hotResult;

    if (this.warmStorage !== undefined) {
      const warmResult = await this.warmStorage.get<BotState>(key);
      if (warmResult !== null) return warmResult;
    }

    if (this.coldStorage !== undefined) {
      return this.coldStorage.get<BotState>(key);
    }

    return null;
  }

  async setBotState(botId: string, state: BotState): Promise<void> {
    const key = botKey(botId);
    // Write to hot tier; warm/cold writes happen via promote()
    await this.hotStorage.set<BotState>(key, state, this.hotTtl);
  }

  async deleteBotState(botId: string): Promise<void> {
    const key = botKey(botId);
    const deletions = this.allStores().map((s) => s.delete(key));
    await Promise.all(deletions);
  }

  // -------------------------------------------------------------------------
  // Scene-scoped state
  // -------------------------------------------------------------------------

  async getSceneState<T>(sceneId: string, key: string): Promise<T | null> {
    const storageKey = sceneKey(sceneId, key);

    const hotResult = await this.hotStorage.get<T>(storageKey);
    if (hotResult !== null) return hotResult;

    if (this.warmStorage !== undefined) {
      const warmResult = await this.warmStorage.get<T>(storageKey);
      if (warmResult !== null) return warmResult;
    }

    if (this.coldStorage !== undefined) {
      return this.coldStorage.get<T>(storageKey);
    }

    return null;
  }

  async setSceneState<T>(
    sceneId: string,
    key: string,
    value: T
  ): Promise<void> {
    const storageKey = sceneKey(sceneId, key);
    await this.hotStorage.set<T>(storageKey, value, this.hotTtl);
  }

  // -------------------------------------------------------------------------
  // Tier promotion / demotion
  // -------------------------------------------------------------------------

  /**
   * Copies every key that belongs to botId from the `from` tier into the `to`
   * tier, then removes it from the source tier.
   *
   * Promotion moves data up (cold → warm → hot).
   * Demotion moves data down (hot → warm → cold).
   */
  async promote(
    botId: string,
    from: StateTier,
    to: StateTier
  ): Promise<void> {
    if (from === to) return;

    const fromStorage = this.storageForTier(from);
    const toStorage = this.storageForTier(to);

    if (fromStorage === undefined) {
      throw new Error(`No storage configured for tier "${from}"`);
    }
    if (toStorage === undefined) {
      throw new Error(`No storage configured for tier "${to}"`);
    }

    const key = botKey(botId);
    const state = await fromStorage.get<BotState>(key);

    if (state === null) {
      // Nothing to move
      return;
    }

    const ttl = this.ttlForTier(to);
    await toStorage.set<BotState>(key, state, ttl);
    await fromStorage.delete(key);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private storageForTier(tier: StateTier): StorageProvider | undefined {
    switch (tier) {
      case 'hot':
        return this.hotStorage;
      case 'warm':
        return this.warmStorage;
      case 'cold':
        return this.coldStorage;
    }
  }

  private ttlForTier(tier: StateTier): number | undefined {
    switch (tier) {
      case 'hot':
        return this.hotTtl;
      case 'warm':
        return this.warmTtl;
      case 'cold':
        return undefined; // cold storage typically has no TTL
    }
  }

  /**
   * Returns all distinct configured storage instances.
   * Deduplication prevents double-connect/disconnect when the same instance
   * is reused across tiers (e.g., hotStorage === warmStorage).
   */
  private allStores(): readonly StorageProvider[] {
    const seen = new Set<StorageProvider>();
    const stores: StorageProvider[] = [];

    for (const store of [
      this.hotStorage,
      this.warmStorage,
      this.coldStorage,
    ]) {
      if (store !== undefined && !seen.has(store)) {
        seen.add(store);
        stores.push(store);
      }
    }

    return stores;
  }
}

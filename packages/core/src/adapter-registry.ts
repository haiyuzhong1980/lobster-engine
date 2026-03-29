// @lobster-engine/core — AdapterRegistry

import type { AIPlatformAdapter } from './adapter.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AdapterNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------

/**
 * A registry for AIPlatformAdapter instances.
 *
 * Adapters are keyed by name. Utility methods allow callers to discover which
 * adapters can reach their upstream platform at runtime (`detectAvailable`)
 * and to select the best available adapter for a turn (`selectAdapter`).
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, AIPlatformAdapter>();

  /**
   * Register an adapter.
   *
   * @throws {Error} if an adapter with the same name is already registered.
   */
  register(adapter: AIPlatformAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(
        `AIPlatformAdapter "${adapter.name}" is already registered. ` +
          `Unregister it first before re-registering.`,
      );
    }
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Retrieve an adapter by its unique name.
   */
  get(name: string): AIPlatformAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Retrieve an adapter by the platform it serves (e.g. "openclaw", "coze").
   * Returns the first match when multiple adapters share the same platform.
   */
  getByPlatform(platform: string): AIPlatformAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.platform === platform) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * Returns a snapshot of all registered adapters as read-only descriptors.
   */
  list(): ReadonlyArray<{ name: string; platform: string }> {
    return Array.from(this.adapters.values()).map(({ name, platform }) => ({
      name,
      platform,
    }));
  }

  /**
   * Returns true when an adapter with the given name is registered.
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Probe all registered adapters concurrently using their `detect()` method.
   *
   * @returns Adapters whose `detect()` resolved to true, preserving
   *          registration order. An adapter that throws is treated as
   *          unavailable.
   */
  async detectAvailable(): Promise<AIPlatformAdapter[]> {
    const all = Array.from(this.adapters.values());

    const results = await Promise.allSettled(
      all.map(async (adapter) => {
        const available = await adapter.detect();
        return { adapter, available };
      }),
    );

    const available: AIPlatformAdapter[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.available) {
        available.push(result.value.adapter);
      }
    }

    return available;
  }

  /**
   * Select the best adapter to use for a turn.
   *
   * Resolution order:
   * 1. If `preferred` is given and that adapter is registered, use it
   *    (regardless of availability — the caller may handle connection errors).
   * 2. Otherwise run `detectAvailable()` and return the first available adapter.
   * 3. If none are available, throw `AdapterNotFoundError`.
   *
   * @param preferred - Optional adapter name to try first.
   */
  async selectAdapter(preferred?: string): Promise<AIPlatformAdapter> {
    if (preferred !== undefined) {
      const found = this.adapters.get(preferred);
      if (found !== undefined) {
        return found;
      }
    }

    const available = await this.detectAvailable();

    if (available.length === 0) {
      throw new AdapterNotFoundError(
        'No AI platform adapters are currently available. ' +
          `Registered adapters: [${Array.from(this.adapters.keys()).join(', ')}]. ` +
          'Check connectivity and adapter configuration.',
      );
    }

    return available[0];
  }
}

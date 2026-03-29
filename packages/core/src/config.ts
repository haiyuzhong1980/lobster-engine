// @lobster-engine/core — ConfigManager

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// ConfigSource interface and implementations
// ---------------------------------------------------------------------------

export interface ConfigSource {
  get(key: string): string | undefined;
  keys(): ReadonlySet<string>;
}

export class EnvConfigSource implements ConfigSource {
  get(key: string): string | undefined {
    return process.env[key];
  }

  keys(): ReadonlySet<string> {
    return new Set(Object.keys(process.env));
  }
}

export class FileConfigSource implements ConfigSource {
  private readonly data: Readonly<Record<string, string>>;

  constructor(filePath: string) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Config file must be a JSON object: ${filePath}`);
      }
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') {
          normalized[k] = v;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          normalized[k] = String(v);
        }
        // Non-primitive values are skipped intentionally
      }
      this.data = Object.freeze(normalized);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // File not found — treat as empty source
        this.data = Object.freeze({});
      } else {
        throw err;
      }
    }
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  keys(): ReadonlySet<string> {
    return new Set(Object.keys(this.data));
  }
}

export class DefaultConfigSource implements ConfigSource {
  private readonly defaults: Readonly<Record<string, string>>;

  constructor(defaults: Readonly<Record<string, string>>) {
    this.defaults = Object.freeze({ ...defaults });
  }

  get(key: string): string | undefined {
    return this.defaults[key];
  }

  keys(): ReadonlySet<string> {
    return new Set(Object.keys(this.defaults));
  }
}

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

const ENGINE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  LOBSTER_STORAGE_TYPE: 'memory',
  LOBSTER_ADAPTER_TYPE: 'direct',
  LOBSTER_LOG_LEVEL: 'info',
  LOBSTER_PORT: '3000',
  LOBSTER_HOST: '0.0.0.0',
});

export class ConfigManager {
  static readonly KEYS = {
    STORAGE_TYPE: 'LOBSTER_STORAGE_TYPE',
    STORAGE_URL: 'LOBSTER_STORAGE_URL',
    ADAPTER_TYPE: 'LOBSTER_ADAPTER_TYPE',
    ADAPTER_URL: 'LOBSTER_ADAPTER_URL',
    ADAPTER_TOKEN: 'LOBSTER_ADAPTER_TOKEN',
    LOG_LEVEL: 'LOBSTER_LOG_LEVEL',
    PORT: 'LOBSTER_PORT',
    HOST: 'LOBSTER_HOST',
  } as const;

  private readonly sources: readonly ConfigSource[];

  constructor(sources?: readonly ConfigSource[]) {
    // Default priority: env > built-in defaults
    this.sources = Object.freeze(
      sources ?? [
        new EnvConfigSource(),
        new DefaultConfigSource(ENGINE_DEFAULTS),
      ]
    );
  }

  /**
   * Returns the first value found across sources (highest priority wins).
   */
  get(key: string): string | undefined {
    for (const source of this.sources) {
      const value = source.get(key);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Like get() but throws a descriptive error when the key is absent.
   */
  getRequired(key: string): string {
    const value = this.get(key);
    if (value === undefined) {
      throw new Error(
        `Required configuration key "${key}" is not set in any config source.`
      );
    }
    return value;
  }

  /**
   * Returns the value coerced to a number, or defaultValue when absent/NaN.
   */
  getNumber(key: string, defaultValue?: number): number {
    const raw = this.get(key);
    if (raw === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(
        `Required numeric configuration key "${key}" is not set.`
      );
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `Configuration key "${key}" has value "${raw}" which cannot be converted to a finite number.`
      );
    }
    return parsed;
  }

  /**
   * Returns the value coerced to a boolean.
   * "true", "1", "yes" → true; "false", "0", "no" → false (case-insensitive).
   */
  getBoolean(key: string, defaultValue?: boolean): boolean {
    const raw = this.get(key);
    if (raw === undefined) {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(
        `Required boolean configuration key "${key}" is not set.`
      );
    }
    const lower = raw.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    throw new Error(
      `Configuration key "${key}" has value "${raw}" which cannot be converted to a boolean.`
    );
  }

  /**
   * Returns a merged, read-only view of all keys across all sources.
   * Higher-priority sources win for duplicate keys.
   */
  getAll(): ReadonlyMap<string, string> {
    // Iterate sources in reverse order so higher-priority sources overwrite
    const merged = new Map<string, string>();
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const source = this.sources[i];
      for (const key of source.keys()) {
        const value = source.get(key);
        if (value !== undefined) {
          merged.set(key, value);
        }
      }
    }
    return merged;
  }
}

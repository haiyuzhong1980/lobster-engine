// @lobster-engine/core — StorageProvider interface

export interface QueryFilter {
  readonly prefix?: string;
  readonly tags?: Readonly<Record<string, string>>;
  readonly limit?: number;
  readonly offset?: number;
}

export interface StorageProvider {
  readonly name: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<boolean>;

  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;

  getMany<T = unknown>(keys: readonly string[]): Promise<Map<string, T>>;
  setMany<T = unknown>(entries: ReadonlyMap<string, T>, ttl?: number): Promise<void>;

  query<T = unknown>(filter: QueryFilter): Promise<readonly T[]>;
  count(filter: QueryFilter): Promise<number>;
}

// @lobster-engine/cli — CLI configuration management

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { DEFAULT_PID_FILE } from './pid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StorageType = 'memory' | 'sqlite' | 'redis' | 'postgres';

export interface CliConfig {
  readonly port: number;
  readonly host: string;
  readonly storage: StorageType;
  readonly pidFile: string;
  readonly logLevel: string;
  readonly natsUrl?: string;
  readonly redisUrl?: string;
  readonly postgresUrl?: string;
}

export interface StartOptions {
  readonly port?: string;
  readonly host?: string;
  readonly storage?: string;
  readonly config?: string;
}

// ---------------------------------------------------------------------------
// Default config file paths (searched in order)
// ---------------------------------------------------------------------------

const LOCAL_CONFIG = join(process.cwd(), 'lobster-engine.config.json');
const GLOBAL_CONFIG = join(homedir(), '.config', 'lobster-engine', 'config.json');

export const DEFAULT_CONFIG_PATH = LOCAL_CONFIG;
export const GLOBAL_CONFIG_PATH = GLOBAL_CONFIG;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: CliConfig = {
  port: 3000,
  host: '0.0.0.0',
  storage: 'memory',
  pidFile: DEFAULT_PID_FILE,
  logLevel: 'info',
};

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function readConfigFile(filePath: string): Partial<CliConfig> {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Partial<CliConfig>;
  } catch {
    return {};
  }
}

function resolveConfigFilePath(explicitPath?: string): string | undefined {
  if (explicitPath !== undefined) return explicitPath;
  if (existsSync(LOCAL_CONFIG)) return LOCAL_CONFIG;
  if (existsSync(GLOBAL_CONFIG)) return GLOBAL_CONFIG;
  return undefined;
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function fromEnv(): Partial<{ -readonly [K in keyof CliConfig]: CliConfig[K] }> {
  const result: Partial<{ -readonly [K in keyof CliConfig]: CliConfig[K] }> = {};

  const port = process.env['LOBSTER_PORT'];
  if (port !== undefined) {
    const n = parseInt(port, 10);
    if (Number.isFinite(n)) result.port = n as CliConfig['port'];
  }

  const host = process.env['LOBSTER_HOST'];
  if (host !== undefined) result.host = host;

  const storage = process.env['LOBSTER_STORAGE_TYPE'];
  if (storage !== undefined) result.storage = storage as StorageType;

  const logLevel = process.env['LOBSTER_LOG_LEVEL'];
  if (logLevel !== undefined) result.logLevel = logLevel;

  const pidFile = process.env['LOBSTER_PID_FILE'];
  if (pidFile !== undefined) result.pidFile = pidFile;

  const natsUrl = process.env['LOBSTER_NATS_URL'];
  if (natsUrl !== undefined) result.natsUrl = natsUrl;

  const redisUrl = process.env['LOBSTER_REDIS_URL'];
  if (redisUrl !== undefined) result.redisUrl = redisUrl;

  const postgresUrl = process.env['LOBSTER_POSTGRES_URL'];
  if (postgresUrl !== undefined) result.postgresUrl = postgresUrl;

  return result;
}

// ---------------------------------------------------------------------------
// Main resolver: CLI flags > env > config file > defaults
// ---------------------------------------------------------------------------

export function resolveConfig(opts: StartOptions = {}): CliConfig {
  const configFilePath = resolveConfigFilePath(opts.config);
  const fileConfig = configFilePath !== undefined ? readConfigFile(configFilePath) : {};
  const envConfig = fromEnv();

  // Build merged config — higher priority layers override lower ones.
  const merged: CliConfig = { ...DEFAULTS, ...fileConfig, ...envConfig };

  // Apply CLI flags last (highest priority).
  let port = merged.port;
  if (opts.port !== undefined) {
    const n = parseInt(opts.port, 10);
    if (Number.isFinite(n)) port = n;
  }

  const host = opts.host ?? merged.host;

  let storage: StorageType = merged.storage;
  if (opts.storage !== undefined && isStorageType(opts.storage)) {
    storage = opts.storage;
  }

  return { ...merged, port, host, storage };
}

function isStorageType(value: string): value is StorageType {
  return value === 'memory' || value === 'sqlite' || value === 'redis' || value === 'postgres';
}

// ---------------------------------------------------------------------------
// Config file read/write
// ---------------------------------------------------------------------------

export function loadRawConfig(filePath?: string): Record<string, unknown> {
  const resolved = filePath ?? resolveConfigFilePath();
  if (resolved === undefined) return {};
  return readConfigFile(resolved) as Record<string, unknown>;
}

export function saveConfigValue(key: string, value: string, filePath?: string): void {
  const target = filePath ?? LOCAL_CONFIG;
  const existing = readConfigFile(target) as Record<string, unknown>;
  const updated = { ...existing, [key]: value };

  const dir = dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(target, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

export function initConfigFile(filePath: string = LOCAL_CONFIG): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const defaultContent: Record<string, unknown> = {
    port: DEFAULTS.port,
    host: DEFAULTS.host,
    storage: DEFAULTS.storage,
    logLevel: DEFAULTS.logLevel,
    pidFile: DEFAULTS.pidFile,
    // Uncomment and fill in as needed:
    // natsUrl: "nats://localhost:4222",
    // redisUrl: "redis://localhost:6379",
    // postgresUrl: "postgresql://localhost:5432/lobster",
  };

  writeFileSync(filePath, JSON.stringify(defaultContent, null, 2) + '\n', 'utf-8');
}

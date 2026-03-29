// @lobster-engine/storage-postgres — lightweight migration runner

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  readonly name: string;
  readonly executedAt: Date | null;
  readonly pending: boolean;
}

export interface MigrationRunnerOptions {
  /** Fully-qualified table name for KV data, e.g. "public"."lobster_kv" */
  readonly kvTable?: string;
  /** Fully-qualified table name for migration tracking */
  readonly migrationsTable?: string;
}

// ---------------------------------------------------------------------------
// Embedded SQL migrations
// The migration files live in `../migrations/` relative to this source file.
// At runtime the transpiled JS sits in dist/, so we resolve from __dirname.
// ---------------------------------------------------------------------------

interface MigrationDef {
  readonly name: string;
  readonly sql: string;
}

// Build migration definitions with inline SQL so the runner works when the
// package is published (no guarantee that .sql files ship alongside dist/).
// If the .sql files are present on disk (development / test) they are loaded
// dynamically; otherwise the embedded strings serve as fallback.
// __dirname is available because this package targets CommonJS (no "type":"module").

function loadSql(filename: string, fallback: string): string {
  try {
    // At runtime __dirname points to dist/; migrations/ is one level up.
    const filePath = join(__dirname, '..', 'migrations', filename);
    return readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// MigrationRunner
// ---------------------------------------------------------------------------

export class MigrationRunner {
  private readonly pool: Pool;
  private readonly kvTable: string;
  private readonly migrationsTable: string;

  constructor(pool: Pool, options: MigrationRunnerOptions = {}) {
    this.pool = pool;
    this.kvTable = options.kvTable ?? '"public"."lobster_kv"';
    this.migrationsTable = options.migrationsTable ?? '"public"."lobster_migrations"';
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run all pending migrations in order.
   * Each migration runs inside a transaction — if it fails the whole migration
   * is rolled back and the error is re-thrown.
   */
  async run(): Promise<void> {
    await this.ensureMigrationsTable();
    const executed = await this.executedNames();
    const pending = this.allMigrations().filter((m) => !executed.has(m.name));

    for (const migration of pending) {
      await this.runOne(migration);
    }
  }

  /**
   * Roll back the last `count` applied migrations (default: 1).
   * NOTE: this implementation only removes tracking records; actual schema
   * rollback SQL is not executed automatically — add explicit DOWN migrations
   * if structural rollback is needed.
   */
  async rollback(count = 1): Promise<void> {
    await this.ensureMigrationsTable();

    const result = await this.pool.query<{ name: string }>(
      `SELECT name FROM ${this.migrationsTable}
       ORDER BY executed_at DESC
       LIMIT $1`,
      [count]
    );

    for (const row of result.rows) {
      await this.pool.query(
        `DELETE FROM ${this.migrationsTable} WHERE name = $1`,
        [row.name]
      );
    }
  }

  /**
   * Return the status of every known migration.
   */
  async status(): Promise<MigrationStatus[]> {
    await this.ensureMigrationsTable();
    const executed = await this.executedRows();

    return this.allMigrations().map((m) => {
      const row = executed.get(m.name);
      return {
        name: m.name,
        executedAt: row ?? null,
        pending: row === undefined,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private allMigrations(): MigrationDef[] {
    return [
      {
        name: '001_init',
        sql: loadSql(
          '001_init.sql',
          this.buildInitSql()
        ),
      },
    ];
  }

  private buildInitSql(): string {
    // Use the configured table names so they match what the provider uses
    return `
CREATE TABLE IF NOT EXISTS ${this.kvTable} (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lobster_kv_expires
  ON ${this.kvTable} (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lobster_kv_key_pattern
  ON ${this.kvTable} (key text_pattern_ops);
    `.trim();
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id          SERIAL      PRIMARY KEY,
        name        TEXT        NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);
  }

  private async executedNames(): Promise<Set<string>> {
    const rows = await this.executedRows();
    return new Set(rows.keys());
  }

  private async executedRows(): Promise<Map<string, Date>> {
    const result = await this.pool.query<{ name: string; executed_at: Date }>(
      `SELECT name, executed_at FROM ${this.migrationsTable} ORDER BY executed_at ASC`
    );
    const map = new Map<string, Date>();
    for (const row of result.rows) {
      map.set(row.name, row.executed_at);
    }
    return map;
  }

  private async runOne(migration: MigrationDef): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${this.migrationsTable} (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING`,
        [migration.name]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(
        `Migration "${migration.name}" failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      client.release();
    }
  }
}

-- Migration 001: Create lobster key-value storage table and indexes

CREATE TABLE IF NOT EXISTS lobster_kv (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lobster_kv_expires
  ON lobster_kv (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lobster_kv_key_pattern
  ON lobster_kv (key text_pattern_ops);

CREATE TABLE IF NOT EXISTS lobster_migrations (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

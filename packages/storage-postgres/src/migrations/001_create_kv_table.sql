-- Migration 001: Create key-value storage table
-- Up
CREATE TABLE IF NOT EXISTS kv_store (
  key          TEXT        NOT NULL PRIMARY KEY,
  value        JSONB       NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  ttl_expires_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down
-- DROP TABLE IF EXISTS kv_store;

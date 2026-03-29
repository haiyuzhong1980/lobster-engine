-- Migration 002: Create indexes for kv_store
-- Up
CREATE INDEX IF NOT EXISTS idx_kv_store_key
  ON kv_store (key);

CREATE INDEX IF NOT EXISTS idx_kv_store_tags_gin
  ON kv_store USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_kv_store_ttl_expires_at
  ON kv_store (ttl_expires_at)
  WHERE ttl_expires_at IS NOT NULL;

-- Down
-- DROP INDEX IF EXISTS idx_kv_store_key;
-- DROP INDEX IF EXISTS idx_kv_store_tags_gin;
-- DROP INDEX IF EXISTS idx_kv_store_ttl_expires_at;

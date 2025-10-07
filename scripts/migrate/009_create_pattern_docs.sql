BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Using snake_case table name for PostgreSQL conventions
CREATE TABLE IF NOT EXISTS pattern_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL, -- TEXT can store very large documents (up to ~1GB)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pattern_docs_created_at ON pattern_docs (created_at DESC);

COMMIT;

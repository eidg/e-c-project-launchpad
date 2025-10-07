-- 006_deprecate_audit.sql
-- Purpose: Mark audit-related tables as deprecated without dropping data.
-- This migration is non-destructive and serves as a signal for future removal.

DO $$
BEGIN
  -- Add deprecation comments if tables exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_runs') THEN
    EXECUTE 'COMMENT ON TABLE audit_runs IS ''DEPRECATED: This table will be removed in a future migration.''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_results') THEN
    EXECUTE 'COMMENT ON TABLE audit_results IS ''DEPRECATED: This table will be removed in a future migration.''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'properties') THEN
    EXECUTE 'COMMENT ON TABLE properties IS ''DEPRECATED: This table will be removed in a future migration.''';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'airbnb_snapshots') THEN
    EXECUTE 'COMMENT ON TABLE airbnb_snapshots IS ''DEPRECATED: This table will be removed in a future migration.''';
  END IF;
END$$;

-- Optional marker for tracking cleanup state
CREATE TABLE IF NOT EXISTS cleanup_markers (
  key text PRIMARY KEY,
  noted_at timestamptz NOT NULL DEFAULT now(),
  detail text
);

INSERT INTO cleanup_markers(key, detail)
VALUES ('006_deprecate_audit', 'Marked audit-related tables as deprecated (non-destructive).')
ON CONFLICT (key) DO NOTHING;

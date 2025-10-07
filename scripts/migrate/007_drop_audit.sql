-- 007_drop_audit.sql
-- Purpose: Permanently drop deprecated audit-related tables in a safe, idempotent order.
-- Order: audit_results -> audit_runs -> airbnb_snapshots -> properties

BEGIN;

-- Drop audit_results first (likely depends on audit_runs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_results'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS audit_results CASCADE';
  END IF;
END$$;

-- Then audit_runs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_runs'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS audit_runs CASCADE';
  END IF;
END$$;

-- Then airbnb_snapshots
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='airbnb_snapshots'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS airbnb_snapshots CASCADE';
  END IF;
END$$;

-- Finally properties
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='properties'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS properties CASCADE';
  END IF;
END$$;

COMMIT;

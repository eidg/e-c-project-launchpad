-- 005_pricing_audit.sql
-- MVP audit-related tables

-- Use gen_random_uuid() from pgcrypto (enabled in 002_auth.sql)
-- If not present, ensure: CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Minimal properties table (upsert a row when first audited)
CREATE TABLE IF NOT EXISTS properties (
  property_uid       BIGINT PRIMARY KEY,
  property_name      TEXT,
  city               TEXT,
  province_state     TEXT,
  latitude           DOUBLE PRECISION,
  longitude          DOUBLE PRECISION,
  source_url         TEXT,
  ra_url             TEXT,
  min_price          NUMERIC,
  max_price          NUMERIC,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION touch_properties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_properties ON properties;
CREATE TRIGGER trg_touch_properties
BEFORE UPDATE ON properties
FOR EACH ROW EXECUTE PROCEDURE touch_properties_updated_at();

-- Raw Airbnb pricing snapshot per run (for auditability)
CREATE TABLE IF NOT EXISTS airbnb_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airbnb_url         TEXT NOT NULL,
  check_in           DATE,
  check_out          DATE,
  nights             INTEGER,
  currency           TEXT,
  nightly_rate       NUMERIC,
  cleaning_fee       NUMERIC,
  service_fee        NUMERIC,
  taxes              NUMERIC,
  all_in_total       NUMERIC,
  raw_payload        JSONB,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Audit runs tie a property + an Airbnb snapshot
CREATE TABLE IF NOT EXISTS audit_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  property_uid       BIGINT REFERENCES properties(property_uid) ON DELETE CASCADE,
  airbnb_snapshot_id UUID REFERENCES airbnb_snapshots(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Result with computed assertions/flags
CREATE TABLE IF NOT EXISTS audit_results (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id              UUID REFERENCES audit_runs(id) ON DELETE CASCADE,
  pm_min_price              NUMERIC,
  best_price_required       NUMERIC,
  target_margin_pct         NUMERIC,
  recommended_guest_price   NUMERIC,
  best_price_ok             BOOLEAN,
  margin_ok                 BOOLEAN,
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT now()
);

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_audit_runs_property ON audit_runs(property_uid);

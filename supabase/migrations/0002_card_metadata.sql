-- Phase 1: Add card-level master data columns
-- site and equipment are kept for backward compatibility and will be removed
-- in a future cleanup migration (0003_drop_deprecated_columns.sql).

ALTER TABLE cards ADD COLUMN IF NOT EXISTS customer text NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS model    text NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sid      text NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS eq_id    text NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';

-- Backfill new columns from existing data
UPDATE cards SET customer = site, model = equipment
WHERE customer = '' OR model = '';

-- Password storage table
-- The initial row is seeded at app startup (not here) because bcrypt runs in
-- Node.js, not in SQL. On first boot the API reads DASHBOARD_PASSWORD from env,
-- hashes it, and inserts via ON CONFLICT DO NOTHING.
CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

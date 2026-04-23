-- Add site_survey and noise_level as card master data columns.
-- These fields are managed at the card level rather than per-report,
-- so technicians only need to enter them once per equipment.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS site_survey text NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS noise_level text NOT NULL DEFAULT '';

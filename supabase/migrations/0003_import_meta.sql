-- Add import metadata column to documents for tracking Excel imports
-- source_meta stores: { import_hash, file_name, sheet_name, imported_at }
-- import_hash = SHA-256 of (file_name + '::' + sheet_name) used for deduplication

ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_meta jsonb DEFAULT NULL;

-- Add release date range columns for historical data
ALTER TABLE tomica_catalog ADD COLUMN IF NOT EXISTS release_start TEXT;
ALTER TABLE tomica_catalog ADD COLUMN IF NOT EXISTS release_end TEXT;
CREATE INDEX IF NOT EXISTS idx_catalog_release_start ON tomica_catalog(release_start);

-- Add structured visual attributes for AI enrichment and filtering
ALTER TABLE tomica_catalog ADD COLUMN IF NOT EXISTS attributes JSONB;
CREATE INDEX IF NOT EXISTS idx_catalog_attributes ON tomica_catalog USING GIN (attributes);

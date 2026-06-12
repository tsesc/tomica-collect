-- Release lifecycle: track when a model leaves the official lineup.
-- Adds retired_at DATE (NULL = still in production) and a partial index
-- for querying current (non-retired) models. release_date already exists
-- from 001 but is included defensively for fresh databases.

ALTER TABLE tomica_catalog
  ADD COLUMN IF NOT EXISTS release_date DATE,
  ADD COLUMN IF NOT EXISTS retired_at DATE;

-- Fast lookup of current lineup ("現行品") per series
CREATE INDEX IF NOT EXISTS idx_catalog_current_lineup
  ON tomica_catalog(series, model_number)
  WHERE retired_at IS NULL;

-- Multilingual official names: Taiwan / Hong Kong / China translations differ,
-- so each gets its own column. Also rebuilds the search_tsv GENERATED column
-- (from 005) to include the zh names — GENERATED expressions cannot be ALTERed,
-- so the column is dropped and re-added, preserving the original FTS weights.

ALTER TABLE tomica_catalog
  ADD COLUMN IF NOT EXISTS car_name_zh_tw TEXT,
  ADD COLUMN IF NOT EXISTS car_name_zh_hk TEXT,
  ADD COLUMN IF NOT EXISTS car_name_zh_cn TEXT;

-- Rebuild search_tsv only if it doesn't already include the zh columns
-- (idempotent: skips when re-run, also creates the column if 005's version is missing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'tomica_catalog'::regclass
      AND a.attname = 'search_tsv'
      AND pg_get_expr(d.adbin, d.adrelid) LIKE '%car_name_zh_tw%'
  ) THEN
    ALTER TABLE tomica_catalog DROP COLUMN IF EXISTS search_tsv;
    ALTER TABLE tomica_catalog ADD COLUMN search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(car_name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(car_name_zh_tw, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(car_name_zh_hk, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(car_name_zh_cn, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(manufacturer, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(model_number, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(submission_notes, '')), 'D')
      ) STORED;
  END IF;
END $$;

-- DROP COLUMN above also drops the GIN index; recreate it
CREATE INDEX IF NOT EXISTS idx_catalog_search_tsv ON tomica_catalog USING GIN(search_tsv);

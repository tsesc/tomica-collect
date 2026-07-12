-- supabase/migrations/008_new_release_watcher.sql
-- Support for the new-release watcher pipeline (watch-new / enrich-new / import-new).
--
-- car_name_zh_tw is already added by 007_multilingual_names.sql, so this migration
-- only adds the EN/zh-TW *description* columns that the full-enrichment Gemini call
-- produces, plus the unique key the importer needs for ON CONFLICT.

ALTER TABLE tomica_catalog
  ADD COLUMN IF NOT EXISTS description_en    TEXT,
  ADD COLUMN IF NOT EXISTS description_zh_tw TEXT;

-- Idempotency for the new-release importer: ON CONFLICT needs a unique key.
-- (series, model_number) is the natural key for official rows; user-submitted
-- rows can legitimately repeat model_numbers, so we use a partial index that
-- only covers source = 'official'.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_catalog_series_model_official
  ON tomica_catalog (series, model_number)
  WHERE source = 'official';

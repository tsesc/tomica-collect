-- supabase/migrations/009_drop_official_unique_index.sql
-- Reverts 008's uniq_catalog_series_model_official.
--
-- The index assumed (series, model_number) is a natural key for official rows,
-- but Tomica REUSES regular-series numbers across generations (the June 2026
-- lineup adds a new No.19 while the old No.19 row stays until retired_at is
-- set). Any importer using "ON CONFLICT DO NOTHING" without a conflict target
-- (PostgREST's Prefer: resolution=ignore-duplicates) silently dropped every
-- number-reuse row against this index — import-snapshots reported inserted=364
-- while the DB gained 0 rows (2026-07-12).
--
-- Consequence: `scrape import-new` (the manual watch-new pipeline) loses its
-- DB-level idempotency key and must not be scheduled until it gets a proper
-- one (e.g. unique on (series, model_number, car_name) or an import-batch id).

DROP INDEX IF EXISTS uniq_catalog_series_model_official;

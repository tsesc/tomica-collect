-- supabase/migrations/010_collection_layout.sql
-- Showcase arrangement for the collection page ("收納盒"): per-user display
-- order + tile size, synced across devices.
--
-- Shape: {"order": ["<catalog_id>", ...], "sizes": {"<catalog_id>": "s"|"m"|"l"}}
-- Lives on user_settings (own-row RLS already covers CRUD via the
-- "Users can CRUD own settings" policy).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS collection_layout JSONB;

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Supabase Database

Project ref: `qhvtipfmxfdlpolckubb` (Seoul region)

### Migrations
- `001_initial_schema.sql` — 4 tables + RLS + auto-create user_settings trigger
- `002_add_release_dates.sql` — release_start/release_end TEXT columns
- `003_add_attributes.sql` — attributes JSONB + GIN index
- `004_user_submissions.sql` — user-contributed catalog entries (`submitted_by`, `verified`, `submission_status`, `image_hash`) + `user-catalog-images` storage bucket
- `005_contribution_workflow.sql` — admin role, attribute suggestions queue, edit history audit trail, AI feedback loop columns, FTS tsvector + pg_trgm

### Tables
| Table | Rows | RLS |
|-------|------|-----|
| tomica_catalog | ~11,128 (incl. Fandom imports) | publicly readable; admin-only UPDATE/DELETE on official rows; users can INSERT/UPDATE/DELETE own unverified submissions |
| user_collection | per-user | own data only (user_id = auth.uid()) |
| recognition_log | per-user | own data only |
| user_settings | per-user | own data only, auto-created on signup |
| admins | small | SELECT for authenticated; INSERT/UPDATE/DELETE only via service role / SQL Editor |
| attribute_suggestions | growing | SELECT all authenticated; INSERT own pending; DELETE own pending; UPDATE admin-only |
| catalog_edit_history | append-only | SELECT all authenticated; writes only via service role |

### Views
- `admin_pending_queue` — unified queue for review (kind ∈ {`submission`, `suggestion`}) ordered by `created_at` ASC. Use this in admin UI / SQL queries instead of joining manually.

### Key Columns (tomica_catalog)
- `model_number` TEXT — "No.1", "LV-86h", "TP.08", "PU.01"
- `variant` INTEGER — generation number for regular series (No.1 has variants 1-7)
- `series` TEXT — 'regular', 'premium', 'premium_unlimited', 'limited_vintage', 'dream', 'fandom', etc.
- `attributes` JSONB — VehicleAttributes (12 fields: vehicle_category, body_style, colors, features, etc.)
- `release_start`/`release_end` TEXT — "YYYY-MM" format
- `submission_status` TEXT — `'official' | 'user' | 'disputed' | 'rejected'`
- `verified` BOOLEAN — official rows are true; user submissions start false
- `submitted_by` UUID — auth.uid() of contributor (NULL for scraper rows)
- `image_hash` TEXT — SHA-256 of submission image (dedup key)
- `variant_of_id` UUID — self-referencing FK; NULL for top-level entries, set on child variants. Two-level only (enforced by trigger `trg_enforce_variant_levels`)
- `correction_hints` JSONB — written by weekly cron from recognition_log analysis; consumed by `matchCandidates()`
- `search_tsv` tsvector (GENERATED) — FTS over car_name (A) + manufacturer (B) + model_number (C) + submission_notes (D)

### Admin Role
- Single source of truth: `admins(user_id, granted_at, granted_by)` table
- RLS helper: `is_admin(uid UUID)` SECURITY DEFINER function — used by `tomica_catalog`, `attribute_suggestions` UPDATE policies
- Bootstrap: insert manually via SQL Editor (no client-side path); see migration 005 comments

### JSONB Query Patterns
```sql
-- Filter by vehicle category
WHERE attributes->>'vehicle_category' = 'emergency'
-- Filter by color
WHERE attributes->>'primary_color' IN ('red', 'blue')
-- Filter by feature
WHERE attributes->'features' @> '["police_light"]'
```

### Search Patterns (FTS + trigram)
```sql
-- Full-text + fuzzy combined
SELECT *, ts_rank(search_tsv, q) AS rank
FROM tomica_catalog, plainto_tsquery('simple', $1) q
WHERE search_tsv @@ q
   OR car_name % $1                  -- pg_trgm fuzzy match
   OR manufacturer % $1
ORDER BY rank DESC, similarity(car_name, $1) DESC
LIMIT 50;
```

### Variant Tree Patterns
```sql
-- All variants of a parent (including parent itself)
SELECT * FROM tomica_catalog
WHERE id = $parent_id OR variant_of_id = $parent_id;

-- Top-level entries only (no variants)
SELECT * FROM tomica_catalog WHERE variant_of_id IS NULL;
```

### AI Feedback Loop
- `recognition_log.original_top1_catalog_id` / `user_chosen_catalog_id` capture AI's first guess vs. user's final choice
- Partial index `idx_recog_correction` only indexes rows where AI was wrong
- Weekly cron (TBD: `scraper/src/tomica_scraper/feedback_analyzer.py`) reads these, writes `tomica_catalog.correction_hints` JSONB
- `matchCandidates()` in `functions/api/identify.ts` reads `correction_hints` to adjust scoring

### Applying Migrations
Use Supabase MCP: `mcp__plugin_supabase_supabase__apply_migration` with project_id `qhvtipfmxfdlpolckubb`.
Or: `supabase db push` (after `supabase link`).

### Local Docker Backup
```
docker start tomica-postgres
psql -h localhost -p 54320 -U tomica -d tomica_collect
```

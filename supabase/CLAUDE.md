# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Supabase Database

Project ref: `qhvtipfmxfdlpolckubb` (Seoul region)

### Migrations
- `001_initial_schema.sql` — 4 tables + RLS + auto-create user_settings trigger
- `002_add_release_dates.sql` — release_start/release_end TEXT columns
- `003_add_attributes.sql` — attributes JSONB + GIN index

### Tables
| Table | Rows | RLS |
|-------|------|-----|
| tomica_catalog | 2,118 | anon + authenticated SELECT |
| user_collection | per-user | own data only (user_id = auth.uid()) |
| recognition_log | per-user | own data only |
| user_settings | per-user | own data only, auto-created on signup |

### Key Columns (tomica_catalog)
- `model_number` TEXT — "No.1", "LV-86h", "TP.08", "PU.01"
- `variant` INTEGER — generation number for regular series (No.1 has variants 1-7)
- `series` TEXT — 'regular', 'premium', 'premium_unlimited', 'limited_vintage', 'dream'
- `attributes` JSONB — VehicleAttributes (12 fields: vehicle_category, body_style, colors, features, etc.)
- `release_start`/`release_end` TEXT — "YYYY-MM" format

### JSONB Query Patterns
```sql
-- Filter by vehicle category
WHERE attributes->>'vehicle_category' = 'emergency'
-- Filter by color
WHERE attributes->>'primary_color' IN ('red', 'blue')
-- Filter by feature
WHERE attributes->'features' @> '["police_light"]'
```

### Applying Migrations
Use Supabase MCP: `mcp__plugin_supabase_supabase__apply_migration` with project_id `qhvtipfmxfdlpolckubb`.
Or: `supabase db push` (after `supabase link`).

### Local Docker Backup
```
docker start tomica-postgres
psql -h localhost -p 54320 -U tomica -d tomica_collect
```

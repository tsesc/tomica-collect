# Tomica Scraper

Multi-source Tomica data scraper + attribute enrichment pipeline.

See `CLAUDE.md` in this directory for the complete command reference.

## Automated new-release pipeline

The three commands below run sequentially from the
`.github/workflows/watch-new-releases.yml` cron (Mondays 02:00 UTC):

| Command         | Inputs                               | Output                                       |
|-----------------|--------------------------------------|----------------------------------------------|
| `watch-new`     | `SUPABASE_SERVICE_ROLE_KEY`          | `data/new_releases.json` (only if non-empty) |
| `enrich-new`    | `GEMINI_API_KEY` + the JSON above    | overwrites the JSON with full enrichment     |
| `import-new`    | `SUPABASE_SERVICE_ROLE_KEY` + JSON   | INSERTs rows with ON CONFLICT DO NOTHING     |

Each step is also runnable locally via `uv run scrape <command>`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tomica Collect** — open-source Tomica die-cast car collection tracker with AI photo recognition.

- **Live site**: https://tomica-collect.pages.dev
- **GitHub**: https://github.com/tsesc/tomica-collect
- **DB**: 2,118 models across 5 series (Regular, TLV, Premium, Unlimited, Dream) with AI-extracted visual attributes
- AI scan (photo → 3-stage recognition pipeline → catalog match), catalog browse, collection tracking, BYOK API keys (OpenAI/Gemini/Claude)

## Build & Test Commands

```bash
pnpm dev                # Dev server at localhost:5173
pnpm build              # TypeScript compile + Vite build → dist/
pnpm lint               # ESLint
npx vitest run          # Run all tests (must use npx — pnpm recurses into scraper/)
npx vitest run tests/hooks/useAuth.test.ts  # Single test file
```

### Scraper (Python 3.12, under scraper/)
```bash
cd scraper
uv run scrape                     # Regular 150 models
uv run scrape history             # Historical 1028 variants
uv run scrape tlv                 # TLV 1335 models (POST API)
uv run scrape dream               # Dream 27 models
uv run scrape premium             # Premium 5 models
uv run scrape unlimited           # Premium Unlimited 12 models
uv run scrape classify            # Rule-based attribute extraction (no AI, instant)
uv run scrape extract-colors      # Pillow pixel-based color extraction (no AI)
uv run scrape enrich-attributes   # Gemini Flash AI attribute extraction (needs GEMINI_API_KEY)
uv run scrape funbox              # Taiwan retailer data (incl. car_name_zh_tw)
uv run scrape monthly-new [yymm]  # Monthly new-product pages (default: current + next 3 months) + changelog + snapshot diff
uv run scrape changelog           # Re-print last generated changelog (no re-scrape)
uv run scrape fandom-sync         # Incremental Fandom sync via RecentChanges (needs SUPABASE_SERVICE_ROLE_KEY; run `fandom-sync --init` once after a full `scrape fandom`)
uv run scrape tomy-cn             # tomy.cn official China site (zh-CN names)
uv run scrape tomicars-club       # tomicars.club archive — MANUAL ONLY, data license unconfirmed, never schedule
uv run scrape analyze-feedback    # recognition_log → correction_hints (dry-run by default; --apply writes to DB)
uv run scrape import-snapshots    # Import committed data/snapshots/**/*.json into Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
uv run scrape dedup               # Cross-source dedup report
uv run identify photo.jpg         # Local image identification (no AI)
uv run pytest                     # Scraper unit tests (fixture-based, no network)
```

### Deploy
```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect --commit-dirty=true --commit-message="deploy"
```
CI/CD: push to `main` → GitHub Actions (ci.yml: build + test, deploy.yml: Cloudflare Pages).

### Scheduled Automation (GitHub Actions)
- **monthly-scrape.yml** — cron Sat 18:17 UTC (JST Sun 03:17); only proceeds in the third-Saturday(+1 day, JST) release window (`workflow_dispatch` with `force=true` bypasses). Runs `scrape`, `scrape tlv`, `scrape monthly-new`, then opens PR `auto/monthly-scrape` committing `data/snapshots/{YYYY-MM}/` + rolling `data/snapshots/monthly_new.json`, with the changelog as PR body.
- **import-snapshots.yml** — on push to `main` touching `data/snapshots/**`: runs `scrape import-snapshots` (dedup-aware insert into tomica_catalog) + `scrape classify`.
- **weekly-fandom-sync.yml** — cron Mon 19:23 UTC: restores sync state from `data/fandom/fandom_sync_state.json`, runs `scrape fandom-sync` (bootstraps via full `scrape fandom` + `fandom-sync --init` when no state), opens PR `auto/fandom-sync` persisting the advanced state file.
- Required secrets: `SUPABASE_SERVICE_ROLE_KEY` (import/sync DB writes). Optional: `SUPABASE_URL` (defaults to the qhvtipfmxfdlpolckubb project), `DISCORD_WEBHOOK_URL` (notifications, silently skipped if unset).
- Repo setting: Actions → General → "Allow GitHub Actions to create and approve pull requests" must be enabled. PRs created by `GITHUB_TOKEN` do not trigger ci.yml (known limitation).
- `scrape tomicars-club` must NEVER be added to these workflows (data license unconfirmed).

## Architecture

```
React SPA (Vite + Tailwind v4)
  → Cloudflare Pages Functions (/api/identify, /api/settings)
    → AI Vision APIs (OpenAI gpt-4o / Gemini gemini-2.5-flash / Claude claude-sonnet-4-6)
    → Supabase (Auth + Postgres + RLS)

Python Scraper (uv + httpx + Pillow)
  → takaratomy.co.jp, cochume.com, minicar.tomytec.co.jp, funbox
  → Supabase DB (via REST API or MCP)
```

### Key Data Flow
1. Scrapers fetch catalog data → JSON → SQL → Supabase DB
2. classify.py enriches all items with rule-based attributes (vehicle_category, body_style, features)
3. color_extract.py adds pixel-based colors from images (no AI)
4. enrich.py optionally upgrades with Gemini Flash AI vision (most accurate colors)
5. Frontend queries DB with JSONB attribute filters
6. AI recognition uses attributes for pre-filter + weighted scoring

### Frontend Routing (App.tsx)
- `/catalog` — public (no auth required)
- `/`, `/scan-result`, `/collection`, `/settings` — `<ProtectedRoute>` (requires Supabase auth)
- `/auth` — login/signup

Pages never call Supabase directly — all data access goes through hooks in `src/hooks/`.

### Frontend Key Patterns
- **Client-side search**: `lib/search.ts` tokenizes with multilingual synonyms (JA/EN/ZH-TW/ZH-CN) — no DB text search used
- **Client-side numeric sort**: `useCatalog` extracts numbers from `model_number` for correct No.1 < No.10 ordering (DB text sort breaks this)
- **JSONB attribute queries**: `eq('attributes->>vehicle_category', ...)` and `in('attributes->>primary_color', [...])` with GIN index
- **Image compression**: `lib/image.ts` compresses client-side before sending to `/api/identify`
- **Display codes**: `getItemCode()` in `lib/types.ts` generates codes like "No.1-7", "LV-86h", "TP.08"

### Design System ("Diecast Heritage")
Tokens in `src/index.css` via Tailwind v4 `@theme`:
- Primary red: `#af101a` / Container red: `#D32F2F`
- Fonts: Manrope (display), Inter (body), Material Symbols (icons)
- `scrollbar-hide` CSS class for horizontal scroll areas, `line-clamp-2` for card text

### Database (Supabase, project ref: qhvtipfmxfdlpolckubb)
- **tomica_catalog**: ~11,128 models (incl. Fandom imports). `attributes JSONB` with GIN index. Adds `variant_of_id` (parent/child variants, two-level only via trigger), `correction_hints` (AI feedback hints), `search_tsv` (FTS GENERATED column). Public SELECT; admin-only UPDATE/DELETE on official rows; users can write their own unverified submissions.
- **user_collection**: UNIQUE(user_id, catalog_id). RLS: own data only.
- **recognition_log**: AI scan history. `original_top1_catalog_id` / `user_chosen_catalog_id` capture AI vs. user choice for the feedback loop.
- **user_settings**: BYOK API keys (plaintext JSONB). Auto-created via trigger on signup.
- **admins**: source of truth for admin role; `is_admin(uid)` SECURITY DEFINER function used by RLS. Granted only via SQL Editor.
- **attribute_suggestions**: user-proposed attribute corrections. Anyone can SELECT, users INSERT/DELETE own pending, admins UPDATE.
- **catalog_edit_history**: append-only audit trail. Writes only via service role; SELECT for all authenticated.
- **admin_pending_queue** (view): unified review queue (`kind ∈ {submission, suggestion}`).

### Local Docker Backup
```bash
docker start tomica-postgres  # Port 54320, user: tomica, pass: tomica_local, db: tomica_collect
```

## Environment Variables

### Frontend (.env)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — public, baked into bundle

### Cloudflare Workers Secrets
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-side only

### Scraper
- `GEMINI_API_KEY` — for `enrich-attributes` command only
- `SUPABASE_SERVICE_ROLE_KEY` — for direct DB writes (optional, can use MCP instead)

## Known Issues / TODO
- [ ] Migrations 006 (retired_at + current-lineup index) and 007 (car_name_zh_tw/zh_hk/zh_cn + search_tsv rebuild) not yet applied to the live DB — frontend types and scraper output already include the new columns
- [ ] tomicars.club data license unconfirmed — `scrape tomicars-club` is manual-run only; contact the site owner before importing
- [ ] API keys stored as plaintext JSONB — `pgcrypto` enabled but unused
- [ ] No rate limiting on most Cloudflare Functions (submit-catalog has 10/day)
- [ ] SettingsPage writes directly to DB instead of via `/api/settings`
- [ ] useRecognition state doesn't persist across navigation (HomePage → ScanResultPage)
- [ ] Contribution workflow (migration 005) — schema only, runtime pieces still pending:
  - [ ] No admin dashboard UI (currently runs through Supabase SQL Editor, see README "Admin / Backend Operations")
  - [ ] `/api/suggest-edit` endpoint not built (frontend has no UI to propose attribute corrections)
  - [ ] `/api/log-correction` endpoint not built (`recognition_log.user_chosen_catalog_id` never gets written)
  - [x] ~~feedback_analyzer not built~~ — done: `scraper/scraper/feedback_analyzer.py` + `uv run scrape analyze-feedback [--apply]` populates `correction_hints` (`{"confused_with": [{"catalog_id", "count"}], "updated_at"}` on the wrongly-picked row)
  - [ ] `matchCandidates()` in `functions/api/identify.ts` still doesn't consume `correction_hints` — needs a boost for `confused_with` candidates
  - [ ] FTS not wired into `useCatalog` — search still 100% client-side via `lib/search.ts` (now also indexes `car_name_zh_tw/zh_hk/zh_cn`)
  - [ ] `SubmitCatalogModal` doesn't expose `variant_of_id` (variant management has no UI yet)

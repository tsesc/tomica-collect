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
uv run scrape funbox              # Taiwan retailer data
uv run scrape dedup               # Cross-source dedup report
uv run identify photo.jpg         # Local image identification (no AI)
```

### Deploy
```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect --commit-dirty=true --commit-message="deploy"
```
CI/CD: push to `main` → GitHub Actions (ci.yml: build + test, deploy.yml: Cloudflare Pages).

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
- **tomica_catalog**: 2,118 models. `attributes JSONB` with GIN index for filter queries. RLS: `anon` + `authenticated` SELECT.
- **user_collection**: UNIQUE(user_id, catalog_id). RLS: own data only.
- **recognition_log**: AI scan history.
- **user_settings**: BYOK API keys (plaintext JSONB). Auto-created via trigger on signup.

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
- [ ] API keys stored as plaintext JSONB — `pgcrypto` enabled but unused
- [ ] No rate limiting on Cloudflare Functions
- [ ] SettingsPage writes directly to DB instead of via `/api/settings`
- [ ] useRecognition state doesn't persist across navigation (HomePage → ScanResultPage)

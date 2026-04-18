# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tomica Collect** — open-source Tomica die-cast car collection tracker with AI photo recognition.

- **Live site**: https://tomica-collect.pages.dev
- **GitHub**: https://github.com/tsesc/tomica-collect
- AI scan (photo → recognition pipeline → catalog match), catalog browse (150 current + 1028 historical), collection tracking, BYOK API keys (OpenAI/Gemini/Claude)

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
uv run scrape                     # Scrape current 150 models (async, ~1s)
uv run scrape history             # Scrape 1028 historical variants (async, ~11s)
uv run scrape diff <catalog|history>      # Compare current vs latest backup
uv run scrape recover <catalog|history>   # Merge lost items from backup
```

### Deploy
```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect
```
CI/CD: push to `main` → GitHub Actions (ci.yml: build + test, deploy.yml: Cloudflare Pages).

## Architecture

```
React SPA (Vite + Tailwind v4)
  → Cloudflare Pages Functions (/api/identify, /api/settings)
    → AI Vision APIs (OpenAI gpt-4o / Gemini gemini-2.5-flash / Claude claude-sonnet-4-6)
    → Supabase (Auth + Postgres)
```

### Frontend (src/)
- **Routing**: React Router 7. `/catalog` is public; all others wrapped in `<ProtectedRoute>`.
- **Hooks**: `useAuth` (Supabase session), `useCatalog` (filtered queries), `useCollection` (CRUD), `useRecognition` (calls /api/identify with JWT)
- **Design System**: "Diecast Heritage" — primary `#D32F2F`, Manrope headlines, Inter body. Tokens in `src/index.css` via `@theme`.
- **State flow quirk**: `useRecognition` result is created on HomePage but consumed on ScanResultPage — state doesn't persist across navigation.

### API (functions/api/)
Cloudflare Pages Functions. Both endpoints verify JWT from `Authorization: Bearer <token>` and extract verified `user.id` — never trust client-provided user_id.

- **identify.ts**: 3-stage AI recognition pipeline:
  1. Scene classification (box front/back/loose/chassis) — prompt in Chinese
  2. Structured feature extraction (different prompts per input type: BOX_PROMPT vs LOOSE_PROMPT)
  3. Database matching via `matchCandidates` (exported for testing) — exact model_number → 0.99, otherwise weighted feature scoring, top 5 candidates
- **settings.ts**: BYOK API key upsert (note: SettingsPage currently writes directly to DB, bypassing this endpoint)

### Database (Supabase)
- **tomica_catalog**: 150 current models. RLS: `anon` + `authenticated` SELECT. model_number always prefixed "No." (e.g., "No.23").
- **user_collection**: UNIQUE(user_id, catalog_id). RLS: own data only.
- **recognition_log**: AI scan history (input_type, provider, raw_response, candidates, was_corrected).
- **user_settings**: API keys as plaintext JSONB. Auto-created via trigger on signup.
- Migrations: `supabase/migrations/001_initial_schema.sql`, `002_add_release_dates.sql`

### Scraper (scraper/)
Python 3.12 with `uv`. Async concurrent fetching via `httpx.AsyncClient`.

- **tomica.py**: Scrapes takaratomy.co.jp regular lineup. CSS selectors: `div.lineup-box` → `.CarName` → `div.car-pic img`. All 8 pages fetched concurrently.
- **history.py**: Scrapes cochume.com per number (1-150). Text-based regex parsing for variants (`No.X-Y：CarName`), dates (`【販売期間】`), images via alt text. Concurrency: `Semaphore(10)` with 0.3s delay.
- **cli.py**: Auto-backup to `data/backup/` with timestamps before overwriting. Post-scrape diff warns about lost items. Recovery via `scrape recover`.
- **output.py**: Normalizes items, writes JSON + SQL seed (INSERT ON CONFLICT DO NOTHING).
- URL quirks: No.21 has typo URL (`tiomica`), No.141-150 use `longtomica` prefix.

## Environment Variables

### Frontend (.env)
- `VITE_SUPABASE_URL` — Supabase project URL (public, baked into bundle)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (public)

### Cloudflare Workers Secrets (via wrangler secret)
- `SUPABASE_URL` — Same URL but server-side
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (secret, bypasses RLS)

## Testing

- Framework: Vitest + Testing Library + happy-dom (not jsdom)
- `tests/api/identify.test.ts` — unit tests for `matchCandidates()`
- `tests/hooks/*.test.ts` — hook tests for auth, catalog, collection, recognition
- No integration tests for Cloudflare Functions yet

## Known Issues / TODO

- [ ] `/catalog` shows empty grid — RLS may block anon queries despite policy
- [ ] 1028 historical models not imported to Supabase (only in `scraper/data/history.json`)
- [ ] DB needs `variant` column on `tomica_catalog` for historical models
- [ ] API keys stored as plaintext JSONB — `pgcrypto` enabled but unused
- [ ] No rate limiting on Cloudflare Functions
- [ ] Mobile filter chips not implemented on CatalogPage
- [ ] SettingsPage writes directly to DB instead of via `/api/settings`

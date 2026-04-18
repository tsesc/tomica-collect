# AGENTS.md

This file provides guidance to Codex and other code agents working in this repository.

## Project Summary

**Tomica Collect** is a personal Tomica die-cast car collection tracker with AI-assisted photo recognition.

Core user flows:
- Browse the public catalog
- Track a personal owned / missing collection
- Upload a photo of a Tomica box or car and get candidate matches
- Configure a BYOK AI provider for recognition

Project links:
- Live site: https://tomica-collect.pages.dev
- GitHub: https://github.com/tsesc/tomica-collect

## Tech Stack

- Frontend: React 19, Vite, TypeScript, React Router 7, Tailwind CSS v4
- Backend: Cloudflare Pages Functions
- Data/Auth: Supabase Auth + Postgres
- Tests: Vitest + Testing Library
- Scraper: Python 3.12 with `uv`, `httpx`, `beautifulsoup4`, `lxml`

## Build, Test, Run

```bash
pnpm dev
pnpm build
npx vitest run
npx vitest run tests/hooks/useAuth.test.ts
```

Important:
- Use `npx vitest run`, not `pnpm test`, because `pnpm` can recurse into `scraper/`
- Frontend dev server runs at `localhost:5173`

## Scraper Commands

```bash
cd scraper
uv run scrape                             # Current 150 models (async, ~1s)
uv run scrape history                     # All 1028 historical variants (async, ~11s)
uv run scrape diff <catalog|history>      # Compare current vs latest backup
uv run scrape recover <catalog|history>   # Merge lost items from backup
```

Outputs:
- `scraper/data/catalog.json`
- `scraper/data/seed.sql`
- `scraper/data/history.json`
- `scraper/data/backup/` (timestamped backups, auto-created)

## Deploy

```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect
```

CI/CD:
- Push to `main`
- GitHub Actions runs tests
- Cloudflare Pages deploys the built site

## High-Level Architecture

```text
React SPA (Vite)
  -> Cloudflare Pages Functions
  -> Supabase (Auth + Postgres)
  -> External AI APIs (OpenAI / Gemini / Claude)
```

## Important App Structure

### Frontend

- `src/App.tsx`
  Route definitions. `/catalog` is public; home, scan result, collection, and settings are protected.
- `src/hooks/useAuth.ts`
  Supabase auth/session wrapper.
- `src/hooks/useCatalog.ts`
  Catalog query hook with filters.
- `src/hooks/useCollection.ts`
  Per-user collection CRUD.
- `src/hooks/useRecognition.ts`
  Calls `/api/identify` with the current JWT.
- `src/pages/HomePage.tsx`
  Entry point for capture + quick stats.
- `src/pages/ScanResultPage.tsx`
  Candidate review and collection save flow.
- `src/pages/SettingsPage.tsx`
  AI provider selection, API key entry, export actions.

### API

- `functions/api/identify.ts`
  Three-stage recognition flow:
  1. Scene classification
  2. Feature extraction
  3. Catalog matching via `matchCandidates`
- `functions/api/settings.ts`
  Authenticated settings upsert endpoint

### Database

- `supabase/migrations/001_initial_schema.sql`
  Base schema for:
  - `tomica_catalog`
  - `user_collection`
  - `recognition_log`
  - `user_settings`

### Scraper

- `scraper/scraper/tomica.py`
  Scrapes current regular lineup from Takara Tomy
- `scraper/scraper/history.py`
  Scrapes historical variants from cochume.com
- `scraper/scraper/cli.py`
  Scraper entrypoint

## Environment Variables

### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Cloudflare Pages / Functions

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Data Shape Notes

- Current scraped catalog size: 150 regular models
- Historical scraped dataset: 1028 variants
- Historical data is present in `scraper/data/history.json` but is not fully imported into Supabase yet

## Current Implementation Gaps

These are important when changing behavior because the code and intended product behavior are not fully aligned yet.

- `/catalog` is a public route, but the initial migration currently grants `tomica_catalog` read access only to `authenticated`, not `anon`
- `ScanResultPage` relies on `useRecognition()` local state, but the recognition result is created on `HomePage`; this means the result does not persist cleanly across navigation
- `SettingsPage` currently writes `user_settings` directly from the frontend instead of going through `functions/api/settings.ts`
- BYOK implementation in code supports `openai`, `gemini`, and `claude`
- API keys are currently stored in plaintext JSONB in `user_settings`; `pgcrypto` is enabled but not yet used for encryption
- Catalog cards have no detail view or click-through behavior yet
- Mobile catalog filtering is incomplete; sidebar filters are desktop-only
- Historical variants need schema support such as a `variant` column before full import
- No rate limiting is implemented on the Cloudflare Functions

## Agent Guidance

- Prefer small, local fixes over broad refactors
- Preserve the current visual language: red-centered "Diecast Heritage", Manrope for headings, Inter for body text
- When touching auth or collection logic, verify both route protection and Supabase RLS assumptions
- When touching scan flow, check both the frontend state flow and the Cloudflare Function contract
- When touching catalog behavior, confirm whether the route is intended to remain public and whether database policies match that intent
- Keep docs aligned with the codebase; avoid claiming support for providers or flows that are not actually implemented

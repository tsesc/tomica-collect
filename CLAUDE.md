# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tomica Collect** is an open-source personal Tomica die-cast car collection tracker with AI-powered photo recognition. Users photograph a Tomica car (boxed or loose), AI identifies the model, and they track their collection against a complete catalog.

- **Live site**: https://tomica-collect.pages.dev
- **GitHub**: https://github.com/tsesc/tomica-collect

### Key Features
- AI scan: photograph box or car body → multi-stage recognition pipeline → catalog match
- Catalog browse: 150 current + 1028 historical Tomica models (No.1~150, all generations since 1970)
- Collection tracking: owned/missing list, stats, CSV/JSON export
- BYOK: bring your own API key (OpenAI / Gemini / Claude)

## Build & Test Commands

```bash
pnpm build              # Build frontend (Vite)
npx vitest run          # Run all tests (must use npx, not pnpm — pnpm recurses into scraper/)
npx vitest run tests/hooks/useAuth.test.ts  # Single test file
pnpm dev                # Dev server at localhost:5173
```

### Scraper (Python, separate project under scraper/)
```bash
cd scraper
uv run scrape           # Scrape current 150 models from takaratomy.co.jp
uv run scrape history   # Scrape all 1028 historical variants from cochume.com
```

### Deploy
```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect
```
CI/CD: push to `main` triggers GitHub Actions → test + deploy to Cloudflare Pages.

## Architecture

```
React SPA (Vite) → Cloudflare Pages Functions → AI Vision APIs (OpenAI/Gemini/Claude)
                                               → Supabase (Auth + Postgres + Storage)
```

### Frontend (src/)
- **Pages**: Route-based. `/catalog` is public (no auth). All others require auth via `<ProtectedRoute>`.
- **Hooks**: `useAuth` (Supabase auth), `useCatalog` (query catalog), `useCollection` (CRUD collection), `useRecognition` (AI scan flow — sends JWT in Authorization header)
- **Design System**: "Diecast Heritage" — primary red #D32F2F, Manrope headlines, Inter body. Tokens defined in `src/index.css` via Tailwind `@theme`.

### API (functions/api/)
Cloudflare Pages Functions. Both endpoints verify JWT from `Authorization: Bearer <token>` header and extract `user.id` from the verified token — never trust client-provided `user_id`.

- **identify.ts**: 3-stage AI recognition pipeline:
  1. Scene classification (box front/back/loose/chassis)
  2. Structured feature extraction (different prompts per input type)
  3. Database matching + candidate ranking (`matchCandidates` function, exported for testing)
- **settings.ts**: BYOK API key management (upsert to user_settings)

### Database (Supabase)
- **tomica_catalog**: 150 current models with official images. RLS open to `anon` + `authenticated` for SELECT.
- **user_collection**: Per-user collection with UNIQUE(user_id, catalog_id). RLS: own data only.
- **recognition_log**: AI recognition history for prompt optimization.
- **user_settings**: API keys + provider preference. Auto-created via trigger on signup.
- Migration: `supabase/migrations/001_initial_schema.sql`

### Scraper (scraper/)
Python project using `uv`. Two data sources:
- `tomica.py`: Scrapes takaratomy.co.jp regular lineup (div.lineup-box + .CarName selector). Outputs `data/catalog.json` + `data/seed.sql`.
- `history.py`: Scrapes cochume.com for all historical generations per number. Outputs `data/history.json`. Extracts images from lazy-loaded `img` tags via alt text pattern matching.

## Environment Variables

### Frontend (.env)
- `VITE_SUPABASE_URL` — Supabase project URL (public, baked into bundle)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key (public)

### Cloudflare Workers Secrets (via wrangler secret)
- `SUPABASE_URL` — Same URL but for server-side
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (secret, bypasses RLS)

## Known Issues / TODO

- [ ] `/catalog` page loads but shows empty grid — `useCatalog` hook's Supabase query needs the anon client to work without auth session; may need to verify the query runs correctly for anonymous users
- [ ] Catalog card click does nothing — no detail view/modal implemented yet
- [ ] No image for 3 current models (No.77, No.135, No.140) — scraper couldn't find image URLs
- [ ] Historical 1028 models not yet imported to Supabase (only in `scraper/data/history.json`)
- [ ] DB schema needs `variant` column on `tomica_catalog` to support historical models (same No. different generations)
- [ ] API key encryption: `pgcrypto` enabled but keys stored as plaintext JSONB — need to implement `pgp_sym_encrypt`/`pgp_sym_decrypt`
- [ ] No rate limiting on Cloudflare Functions
- [ ] Mobile filter chips not implemented on CatalogPage (only desktop sidebar)
- [ ] No Stitch desktop catalog design generated (Stitch kept timing out)

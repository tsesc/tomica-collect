# Tomica Collect

Personal Tomica die-cast car collection tracker with AI-powered photo recognition.

**Live site:** https://tomica-collect.pages.dev

## Features

- **AI Scan** — Photograph a Tomica box or loose car, AI identifies the model via a 3-stage recognition pipeline (scene classification → feature extraction → catalog matching)
- **Catalog** — Browse 150 current regular series models + 1028 historical variants (all generations since 1970)
- **Collection** — Track owned/missing, add notes, export as CSV/JSON
- **BYOK** — Bring your own API key: supports OpenAI, Google Gemini, and Claude

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS v4, React Router 7 |
| Backend | Cloudflare Pages Functions |
| Database | Supabase (Auth + Postgres) |
| AI Providers | OpenAI gpt-4o, Gemini gemini-2.5-flash, Claude claude-sonnet-4-6 |
| Scraper | Python 3.12, httpx (async), BeautifulSoup4 |
| Tests | Vitest, Testing Library, happy-dom |

## Getting Started

### Prerequisites
- Node.js 20+, pnpm
- Python 3.12+, [uv](https://docs.astral.sh/uv/)

### Development

```bash
pnpm install
pnpm dev              # http://localhost:5173
```

Create `.env` with your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Build & Test

```bash
pnpm build            # TypeScript compile + Vite build
npx vitest run        # Run tests (use npx, not pnpm)
pnpm lint             # ESLint
```

### Scraper

```bash
cd scraper
uv run scrape                  # Current 150 models (~1s, async)
uv run scrape history          # All 1028 historical variants (~11s, async)
uv run scrape diff catalog     # Compare vs previous run
uv run scrape recover catalog  # Merge lost items from backup
```

### Deploy

```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect
```

Push to `main` triggers CI/CD via GitHub Actions → Cloudflare Pages.

## Architecture

```
React SPA (Vite)
  └─ Cloudflare Pages Functions
       ├─ /api/identify   (3-stage AI recognition)
       └─ /api/settings   (BYOK key management)
            ├─ AI Vision APIs (OpenAI / Gemini / Claude)
            └─ Supabase (Auth + Postgres)
```

### AI Recognition Pipeline

1. **Scene Classification** — Determines input type (box front, box back, loose car, chassis)
2. **Feature Extraction** — Extracts structured data (model number, car name, colors, manufacturer) with type-specific prompts
3. **Candidate Matching** — Scores against catalog database, returns top 5 matches with confidence

### Data Sources

| Source | Data | Method |
|--------|------|--------|
| [takaratomy.co.jp](https://www.takaratomy.co.jp/products/tomica/) | 150 current models | HTML scraping (CSS selectors) |
| [cochume.com](https://cochume.com/) | 1028 historical variants | Text-based regex parsing |

## License

MIT

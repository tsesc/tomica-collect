# Tomica Collect

Open-source Tomica die-cast car collection tracker with AI photo recognition.

**Live site:** https://tomica-collect.pages.dev

## Features

- **AI Scan** — Photograph a Tomica box or loose car, AI identifies the model (supports box front/back, loose car, chassis)
- **Catalog** — Browse 2,100+ models across 5 series (Regular, Premium, TLV, Dream, Unlimited) with multilingual search (EN/JA/ZH)
- **Collection Tracking** — Mark owned/missing cars, view collection progress
- **BYOK** — Bring your own API key: supports OpenAI, Google Gemini, and Claude

## How to Use

### Browse the Catalog

1. Open https://tomica-collect.pages.dev/catalog
2. Switch series tabs: Regular / TLV / Premium / Unlimited / Dream
3. Use number range tabs to navigate (or "All" to see everything)
4. Search by car name, brand, color, or vehicle type in any language:
   - English: `tesla`, `red coupe`, `police`
   - Chinese: `紅色 豐田`, `跑車`, `消防車`
   - Japanese: `フェアレディ`, `スカイライン`
5. Combine search with filters (year, source, vehicle category, color)

### AI Photo Recognition

1. Sign up / log in at https://tomica-collect.pages.dev/auth
2. Go to Settings, enter your AI API key (OpenAI / Gemini / Claude)
3. On the home page, tap **"Take Photo"** or **"Choose from Album"**
4. Wait for the AI loading overlay — recognition takes 5-10 seconds
5. Review the top match with confidence score, confirm to add to collection

**Tips for better recognition:**
- Box front photos work best (model number + car name visible)
- For Premium series, the black box is auto-detected as Premium
- Loose cars rely on visual features (color, shape, markings)

### Track Your Collection

- On the Catalog page, use the "Collection" filter to see owned vs missing
- Tap any car card to view details and toggle collection status

### Contribute to the Catalog

When AI scan can't find a match, or you spot a missing/incorrect entry:

- **Add a new car** — On the catalog page (or post-scan when AI misses), tap **"+ 新增條目"** or **"⚡ 一鍵貢獻並收藏"**. Upload a photo + fill basic details. The entry lands in the shared catalog as `submission_status='user'` / `verified=false`, immediately searchable by everyone.
- **Suggest an attribute fix** — On any car detail modal, tap **"建議修正"** to propose a change to color, vehicle category, etc. Goes into the admin queue.
- **Mark a variant** — When adding a new car, you can tag it as a variant of an existing model (e.g., "2010 紀念色" of No.43). Variants are limited to two levels (parent → child only).

Rate limits: 10 submissions per user per day. Image dedup uses SHA-256 hash.

## Admin / Backend Operations

The "backend" (admin role) is granted via the `admins` table — no separate dashboard URL. Admins can review user submissions and attribute suggestions.

### Granting admin

```sql
-- Run in Supabase SQL Editor (admin granting can only be done with service role)
INSERT INTO admins (user_id)
SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com'
ON CONFLICT DO NOTHING;
```

To revoke: `DELETE FROM admins WHERE user_id = '<uid>';`

### Reviewing the queue

The unified `admin_pending_queue` view shows everything awaiting review:

```sql
-- See all pending work, oldest first
SELECT kind, item_id, catalog_id, user_id, created_at, payload
FROM admin_pending_queue
ORDER BY created_at;
```

`kind` is either `submission` (a new user-contributed catalog entry) or `suggestion` (an attribute change proposed for an existing entry). The `payload` JSONB contains the relevant details for each.

### Approving a user submission

```sql
-- Promote a user-contributed entry to verified/official status
UPDATE tomica_catalog
SET verified = true, submission_status = 'official'
WHERE id = '<catalog_id>';
```

### Approving / rejecting an attribute suggestion

```sql
-- Approve: apply the suggested value to the catalog row, mark the suggestion approved
WITH s AS (
  SELECT * FROM attribute_suggestions WHERE id = '<suggestion_id>'
)
UPDATE attribute_suggestions
SET status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
WHERE id = '<suggestion_id>';
-- Then manually apply the change to tomica_catalog using the field/new_value
-- (a server-side endpoint to atomically do both is on the roadmap)

-- Reject:
UPDATE attribute_suggestions
SET status = 'rejected',
    admin_note = 'reason here',
    reviewed_by = auth.uid(),
    reviewed_at = now()
WHERE id = '<suggestion_id>';
```

### Viewing edit history

```sql
SELECT edited_at, edited_by, source, changed_fields
FROM catalog_edit_history
WHERE catalog_id = '<catalog_id>'
ORDER BY edited_at DESC;
```

> **Note**: An in-app admin dashboard with one-click approve/reject is on the roadmap. For now, all admin actions go through the Supabase SQL Editor.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS v4, React Router 7 |
| Backend | Cloudflare Pages Functions |
| Database | Supabase (Auth + Postgres + RLS) |
| AI Providers | OpenAI gpt-4o, Gemini gemini-2.5-flash, Claude claude-sonnet-4-6 |
| Scraper | Python 3.12, uv, httpx (async), BeautifulSoup4 |
| Tests | Vitest, Testing Library, happy-dom |

## Self-Hosting / Deployment

### Prerequisites

- Node.js 20+, [pnpm](https://pnpm.io/)
- Python 3.12+, [uv](https://docs.astral.sh/uv/)
- A [Supabase](https://supabase.com/) project
- A [Cloudflare](https://www.cloudflare.com/) account (for Pages deployment)

### 1. Clone and Install

```bash
git clone https://github.com/tsesc/tomica-collect.git
cd tomica-collect
pnpm install
```

### 2. Configure Supabase

Create a Supabase project, then run the migrations **in order**:

```bash
# In Supabase SQL Editor, run each file:
supabase/migrations/001_initial_schema.sql        # core tables + RLS
supabase/migrations/002_add_release_dates.sql     # release_start/end
supabase/migrations/003_add_attributes.sql        # attributes JSONB
supabase/migrations/004_user_submissions.sql      # user-contributed entries + storage bucket
supabase/migrations/005_contribution_workflow.sql # admin role + suggestions + FTS
```

After migration 005 runs, bootstrap your admin account (the email you signed up with on the live app):

```sql
INSERT INTO admins (user_id)
SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com'
ON CONFLICT DO NOTHING;
```

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Populate the Catalog

```bash
cd scraper

# Scrape current regular series (150 models, ~1s)
uv run scrape

# Scrape all series
uv run scrape premium      # Premium 50 models
uv run scrape tlv           # Limited Vintage 1300+ models
uv run scrape dream         # Dream Tomica 27 models
uv run scrape unlimited     # Premium Unlimited 12 models
uv run scrape history       # Historical variants 1028 models (~11s)

# Import to Supabase — run generated SQL in data/*.sql
# Or use the classify/enrich commands to add attributes:
uv run scrape classify              # Rule-based attribute extraction (instant)
uv run scrape extract-colors        # Pixel-based color extraction from images
uv run scrape enrich-attributes     # AI-powered attributes via Gemini (needs GEMINI_API_KEY)
uv run scrape find-images 50        # Search images for items missing them
```

### 4. Local Development

```bash
pnpm dev    # http://localhost:5173
```

### 5. Deploy to Cloudflare Pages

```bash
# Set Cloudflare Workers secrets
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Build and deploy
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect
```

Or push to `main` — GitHub Actions (ci.yml + deploy.yml) handles CI/CD automatically.

### 6. Collect Images for Catalog Items

Images come from multiple sources with a priority pipeline:

1. **Official scraper** — `uv run scrape` pulls images from takaratomy.co.jp
2. **Image search** — `uv run scrape find-images <N>` searches Bing for items missing images
3. **Fix duplicates** — `uv run scrape fix-dupes` finds variants sharing the same image and re-searches with year-specific queries
4. **Color extraction** — `uv run scrape extract-colors` analyzes images to detect primary/secondary colors (no AI, uses Pillow)

To check for dead image links and repair:

```bash
# Verify image URLs are alive (in Python)
python3 -c "
import httpx, json
# ... check HTTP status of each image_url
"

# For dead links, re-run find-images targeting those items
uv run scrape find-images 50
```

## Architecture

```
React SPA (Vite + Tailwind v4)
  └─ Cloudflare Pages Functions
       ├─ /api/identify   (3-stage AI recognition pipeline)
       └─ /api/settings   (BYOK API key management)
            ├─ AI Vision APIs (OpenAI / Gemini / Claude)
            └─ Supabase (Auth + Postgres)
```

### AI Recognition Pipeline

1. **Scene Classification** — Determines input type: box front (red=Regular, black=Premium), box back, loose car, chassis
2. **Feature Extraction** — Extracts structured data (model number, car name, series, colors, manufacturer) with type-specific prompts
3. **Candidate Matching** — Series-aware scoring against 2,100+ catalog items. Exact model+series match = 0.99. Otherwise weighted multi-dimension scoring (manufacturer, name, color, category, body style, features, era)

### Search Engine

Client-side search with multilingual synonym expansion:
- Brand names: Toyota ↔ トヨタ ↔ 豐田
- Colors: red ↔ 紅色 ↔ 赤
- Vehicle types: police ↔ パトカー ↔ 警車
- Multi-token AND: "紅色 豐田" = red AND Toyota

### Data Sources

| Source | Data | Method |
|--------|------|--------|
| takaratomy.co.jp | Regular 150, Premium 50, Dream 27, Unlimited 12 | HTML scraping |
| cochume.com | 1028 historical variants | Regex parsing |
| minicar.tomytec.co.jp | TLV 1300+ | POST API |
| Bing Image Search | Missing images | Playwright + Gemini validation |

## Build & Test

```bash
pnpm build            # TypeScript compile + Vite build
npx vitest run        # Run tests (use npx — pnpm recurses into scraper/)
pnpm lint             # ESLint
```

## License

MIT

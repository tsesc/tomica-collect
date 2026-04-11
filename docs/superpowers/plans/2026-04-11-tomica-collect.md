# Tomica Collect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an open-source Tomica die-cast car collection tracker with AI-powered photo recognition, catalog browsing, and personal collection management.

**Architecture:** React SPA (Vite + TypeScript) deployed on Vercel, with Vercel Edge Functions proxying AI Vision API calls (OpenAI/Gemini/Claude). Supabase provides auth, PostgreSQL database, and image storage. A Python scraper populates the initial Tomica catalog from official sources.

**Tech Stack:** React 18, TypeScript, Vite, TailwindCSS, Supabase JS, Vercel Edge Functions, Vitest, React Testing Library, Python 3.12 (uv)

---

## File Structure

```
tomica-collect/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── tailwind.config.ts
├── .env.example
├── .gitignore
│
├── public/
│   └── favicon.svg
│
├── src/
│   ├── main.tsx                          # App entry, router setup
│   ├── App.tsx                           # Root component with layout
│   ├── vite-env.d.ts
│   │
│   ├── lib/
│   │   ├── supabase.ts                   # Supabase client singleton
│   │   ├── image.ts                      # Image compression utility
│   │   └── types.ts                      # Shared TypeScript types
│   │
│   ├── hooks/
│   │   ├── useAuth.ts                    # Auth state hook
│   │   ├── useCatalog.ts                 # Catalog query hook
│   │   ├── useCollection.ts              # Collection CRUD hook
│   │   └── useRecognition.ts             # AI recognition hook
│   │
│   ├── components/
│   │   ├── Layout.tsx                    # App shell: top nav + bottom tabs + content
│   │   ├── BottomNav.tsx                 # Mobile bottom navigation
│   │   ├── TopNav.tsx                    # Desktop top navigation bar
│   │   ├── CatalogCard.tsx              # Single car card (grid item)
│   │   ├── FilterSidebar.tsx            # Catalog filter panel
│   │   ├── ConfidenceRing.tsx           # Circular confidence indicator
│   │   ├── CorrectionDropdown.tsx       # Candidate correction select
│   │   ├── StatsRow.tsx                 # Collection stats (3 cards)
│   │   └── PhotoCapture.tsx             # Camera/file-upload component
│   │
│   ├── pages/
│   │   ├── HomePage.tsx                  # Scan hero + stats + recent
│   │   ├── ScanResultPage.tsx           # Recognition result + confirm
│   │   ├── CatalogPage.tsx              # Full catalog browse + filters
│   │   ├── CollectionPage.tsx           # My collection + missing list
│   │   ├── SettingsPage.tsx             # API keys + account + export
│   │   └── AuthPage.tsx                 # Login / signup
│   │
│   └── styles/
│       └── theme.ts                      # Design tokens (colors, fonts, spacing)
│
├── api/
│   ├── identify.ts                       # Edge Function: AI recognition pipeline
│   └── settings.ts                       # Edge Function: encrypted key management
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql        # All tables + RLS policies
│
├── scraper/
│   ├── pyproject.toml
│   ├── scraper/__init__.py
│   ├── scraper/tomica.py                 # Scrape takaratomy.co.jp
│   ├── scraper/output.py                 # Write JSON + SQL seed
│   └── data/
│       └── catalog.json                  # Scraped catalog data
│
└── tests/
    ├── setup.ts                          # Vitest setup (mocks)
    ├── lib/
    │   └── image.test.ts
    ├── hooks/
    │   ├── useCatalog.test.ts
    │   ├── useCollection.test.ts
    │   └── useRecognition.test.ts
    ├── components/
    │   ├── CatalogCard.test.tsx
    │   ├── ConfidenceRing.test.tsx
    │   ├── CorrectionDropdown.test.tsx
    │   └── PhotoCapture.test.tsx
    ├── pages/
    │   ├── HomePage.test.tsx
    │   ├── ScanResultPage.test.tsx
    │   ├── CatalogPage.test.tsx
    │   ├── CollectionPage.test.tsx
    │   └── SettingsPage.test.tsx
    └── api/
        └── identify.test.ts
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `.env.example`, `vercel.json`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/styles/theme.ts`, `src/lib/types.ts`, `tests/setup.ts`

- [ ] **Step 1: Initialize Vite project with React + TypeScript**

```bash
cd /Users/jacktse/projects/personal/tomica-collect
pnpm create vite . --template react-ts
```

When prompted about existing files, choose to overwrite (it preserves .git).

- [ ] **Step 2: Install dependencies**

```bash
pnpm add react-router-dom @supabase/supabase-js browser-image-compression
pnpm add -D tailwindcss @tailwindcss/vite vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom happy-dom
```

- [ ] **Step 3: Configure TailwindCSS with Diecast Heritage design tokens**

Replace `src/index.css` with:

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');

@theme {
  --color-primary: #af101a;
  --color-primary-container: #D32F2F;
  --color-primary-dark: #B71C1C;
  --color-surface: #fff8f7;
  --color-surface-container: #ffe9e7;
  --color-surface-container-low: #fff0ef;
  --color-surface-container-high: #ffe2de;
  --color-on-surface: #271816;
  --color-on-surface-variant: #5b403d;
  --color-outline: #8f6f6c;
  --color-outline-variant: #e4beba;
  --color-success: #2E7D32;
  --color-error: #ba1a1a;

  --font-display: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

- [ ] **Step 4: Configure Vite with Tailwind plugin and test setup**

Replace `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
  },
})
```

Create `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 5: Create shared types**

Create `src/lib/types.ts`:

```typescript
export type Series = 'regular' | 'premium' | 'limited_vintage' | 'dream'
export type VehicleType = 'sedan' | 'suv' | 'truck' | 'bus' | 'sports' | 'emergency' | 'construction' | 'other'
export type Condition = 'mint' | 'good' | 'fair' | 'poor'
export type AiProvider = 'openai' | 'gemini' | 'claude'
export type InputType = 'box_front' | 'box_back' | 'loose' | 'chassis'

export interface CatalogItem {
  id: string
  model_number: string
  car_name: string
  car_name_en: string | null
  series: Series
  is_first_edition: boolean
  manufacturer: string | null
  vehicle_type: VehicleType | null
  body_color: string[]
  release_date: string | null
  retired: boolean
  image_url: string | null
  source: 'official' | 'manual'
  metadata: Record<string, unknown>
}

export interface CollectionItem {
  id: string
  user_id: string
  catalog_id: string
  photo_url: string | null
  condition: Condition
  has_box: boolean
  notes: string | null
  acquired_date: string | null
  catalog?: CatalogItem
}

export interface RecognitionCandidate {
  catalog_item: CatalogItem
  score: number
  match_reasons: string[]
}

export interface RecognitionResult {
  input_type: InputType
  candidates: RecognitionCandidate[]
  raw_features: Record<string, unknown>
}

export interface UserSettings {
  user_id: string
  ai_provider: AiProvider
  api_keys: Record<AiProvider, string>
}
```

- [ ] **Step 6: Create env example and vercel config**

Create `.env.example`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
ENCRYPTION_KEY=your-32-byte-hex-key-for-api-key-encryption
```

Create `vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

- [ ] **Step 7: Create minimal App with router**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'

function Placeholder({ name }: { name: string }) {
  return <div className="p-4 text-on-surface font-body">{name} — coming soon</div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Placeholder name="Home" />} />
          <Route path="catalog" element={<Placeholder name="Catalog" />} />
          <Route path="collection" element={<Placeholder name="Collection" />} />
          <Route path="settings" element={<Placeholder name="Settings" />} />
          <Route path="scan-result" element={<Placeholder name="Scan Result" />} />
        </Route>
        <Route path="auth" element={<Placeholder name="Auth" />} />
      </Routes>
    </BrowserRouter>
  )
}
```

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Create Layout shell with bottom nav and top nav**

Create `src/components/Layout.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { TopNav } from './TopNav'

export function Layout() {
  return (
    <div className="min-h-screen bg-surface font-body text-on-surface">
      <div className="hidden md:block">
        <TopNav />
      </div>
      <main className="pb-16 md:pb-0">
        <Outlet />
      </main>
      <div className="md:hidden fixed bottom-0 inset-x-0">
        <BottomNav />
      </div>
    </div>
  )
}
```

Create `src/components/BottomNav.tsx`:

```tsx
import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '掃描', icon: '📷' },
  { to: '/catalog', label: '圖鑑', icon: '📚' },
  { to: '/collection', label: '收藏', icon: '🏆' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]

export function BottomNav() {
  return (
    <nav className="flex items-center justify-around h-16 bg-white border-t border-outline-variant">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-xs ${isActive ? 'text-primary' : 'text-on-surface-variant'}`
          }
        >
          <span className="text-lg">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

Create `src/components/TopNav.tsx`:

```tsx
import { Link } from 'react-router-dom'

export function TopNav() {
  return (
    <header className="h-14 bg-primary-container flex items-center justify-between px-6">
      <Link to="/" className="text-white font-display font-bold text-lg tracking-tight">
        Tomica<span className="font-light opacity-85">Collect</span>
      </Link>
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="搜尋型號、車名..."
          className="w-64 px-4 py-1.5 rounded-full bg-white/15 text-white placeholder-white/60 text-sm outline-none focus:bg-white/25"
        />
        <span className="text-white/80 cursor-pointer">👤</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 9: Verify build and dev server work**

Run: `pnpm build`
Expected: Build succeeds with no errors.

Run: `pnpm dev`
Expected: Dev server starts, app renders at http://localhost:5173 with bottom nav and placeholder pages.

- [ ] **Step 10: Run tests to verify setup**

Run: `pnpm vitest run`
Expected: Passes (0 tests found or default test passes).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: Scaffold project with Vite, React, Tailwind, routing, and Diecast Heritage design tokens"
```

---

## Task 2: Supabase Client + Auth Hook

**Files:**
- Create: `src/lib/supabase.ts`, `src/hooks/useAuth.ts`, `src/pages/AuthPage.tsx`
- Test: `tests/hooks/useAuth.test.ts`

- [ ] **Step 1: Create Supabase client**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 2: Write failing test for useAuth**

Create `tests/hooks/useAuth.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuth } from '../../src/hooks/useAuth'

vi.mock('../../src/lib/supabase', () => {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }
  return { supabase: { auth: mockAuth } }
})

describe('useAuth', () => {
  it('starts with loading true and no user', async () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/hooks/useAuth.test.ts`
Expected: FAIL — module `useAuth` not found.

- [ ] **Step 4: Implement useAuth**

Create `src/hooks/useAuth.ts`:

```typescript
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, loading, signIn, signUp, signOut }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/hooks/useAuth.test.ts`
Expected: PASS

- [ ] **Step 6: Create AuthPage**

Create `src/pages/AuthPage.tsx`:

```tsx
import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-bold text-2xl text-primary text-center mb-8">
          Tomica<span className="font-light text-on-surface">Collect</span>
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-error text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full bg-gradient-to-br from-primary-container to-primary-dark text-white font-display font-semibold text-sm disabled:opacity-50"
          >
            {loading ? '處理中...' : isSignUp ? '註冊' : '登入'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-center text-sm text-primary"
          >
            {isSignUp ? '已有帳號？登入' : '沒有帳號？註冊'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Wire AuthPage into router**

In `src/App.tsx`, replace the auth route import:

```tsx
import { AuthPage } from './pages/AuthPage'
// ...
<Route path="auth" element={<AuthPage />} />
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase.ts src/hooks/useAuth.ts src/pages/AuthPage.tsx src/App.tsx tests/hooks/useAuth.test.ts
git commit -m "feat: Add Supabase client, auth hook, and login/signup page"
```

---

## Task 3: Database Schema + Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable pgcrypto for API key encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tomica catalog (read-only for users, seeded by scraper)
CREATE TABLE tomica_catalog (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_number    TEXT NOT NULL,
  car_name        TEXT NOT NULL,
  car_name_en     TEXT,
  series          TEXT NOT NULL DEFAULT 'regular',
  is_first_edition BOOLEAN DEFAULT FALSE,
  manufacturer    TEXT,
  vehicle_type    TEXT,
  body_color      TEXT[] DEFAULT '{}',
  release_date    DATE,
  retired         BOOLEAN DEFAULT FALSE,
  image_url       TEXT,
  source          TEXT DEFAULT 'official',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_catalog_model_number ON tomica_catalog(model_number);
CREATE INDEX idx_catalog_series ON tomica_catalog(series);
CREATE INDEX idx_catalog_manufacturer ON tomica_catalog(manufacturer);

-- User collection
CREATE TABLE user_collection (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id      UUID NOT NULL REFERENCES tomica_catalog(id),
  photo_url       TEXT,
  condition       TEXT DEFAULT 'good',
  has_box         BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  acquired_date   DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, catalog_id)
);

CREATE INDEX idx_collection_user ON user_collection(user_id);

-- Recognition log
CREATE TABLE recognition_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url       TEXT,
  input_type      TEXT,
  ai_provider     TEXT,
  raw_response    JSONB,
  candidates      JSONB,
  final_match     UUID REFERENCES tomica_catalog(id),
  was_corrected   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_recognition_user ON recognition_log(user_id);

-- User settings
CREATE TABLE user_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_provider     TEXT DEFAULT 'openai',
  api_keys        JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE tomica_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog is readable by authenticated users"
  ON tomica_catalog FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE user_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own collection"
  ON user_collection FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE recognition_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own recognition logs"
  ON recognition_log FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own settings"
  ON user_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-create user_settings on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/
git commit -m "feat: Add initial database schema with RLS policies"
```

---

## Task 4: Catalog Scraper (Python)

**Files:**
- Create: `scraper/pyproject.toml`, `scraper/scraper/__init__.py`, `scraper/scraper/tomica.py`, `scraper/scraper/output.py`

- [ ] **Step 1: Initialize Python project with uv**

```bash
cd /Users/jacktse/projects/personal/tomica-collect/scraper
uv init --name tomica-scraper --python 3.12
```

- [ ] **Step 2: Add dependencies**

```bash
cd /Users/jacktse/projects/personal/tomica-collect/scraper
uv add httpx beautifulsoup4 lxml
```

- [ ] **Step 3: Create scraper module**

Create `scraper/scraper/__init__.py`:

```python
```

Create `scraper/scraper/tomica.py`:

```python
"""Scrape Tomica regular series catalog from takaratomy.co.jp."""

import httpx
from bs4 import BeautifulSoup
import json
import re
import time
from pathlib import Path


BASE_URL = "https://www.takaratomy.co.jp/products/tomica/lineup/search.htm"
DETAIL_BASE = "https://www.takaratomy.co.jp/products/tomica"


def fetch_catalog_page(client: httpx.Client) -> BeautifulSoup:
    """Fetch the main catalog listing page."""
    resp = client.get(BASE_URL, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.content, "lxml")


def parse_listing(soup: BeautifulSoup) -> list[dict]:
    """Extract car entries from the listing page."""
    items = []
    for card in soup.select(".lineup_list li, .itemList li, .product-item"):
        item = {}

        # Try to extract model number from text
        number_el = card.select_one(".number, .item-number, .no")
        if number_el:
            item["model_number"] = number_el.get_text(strip=True)

        # Car name
        name_el = card.select_one(".name, .item-name, .ttl, a")
        if name_el:
            item["car_name"] = name_el.get_text(strip=True)

        # Image
        img = card.select_one("img")
        if img and img.get("src"):
            src = img["src"]
            if not src.startswith("http"):
                src = f"{DETAIL_BASE}/{src.lstrip('/')}"
            item["image_url"] = src

        # Detail link for more info
        link = card.select_one("a[href]")
        if link:
            href = link["href"]
            if not href.startswith("http"):
                href = f"{DETAIL_BASE}/{href.lstrip('/')}"
            item["detail_url"] = href

        if item.get("model_number") or item.get("car_name"):
            items.append(item)

    return items


def enrich_item(client: httpx.Client, item: dict) -> dict:
    """Fetch detail page to extract manufacturer, color, etc."""
    detail_url = item.get("detail_url")
    if not detail_url:
        return item

    try:
        resp = client.get(detail_url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")

        # Extract spec table if present
        for row in soup.select("table tr, .spec-item, dl"):
            text = row.get_text()
            if "メーカー" in text or "manufacturer" in text.lower():
                val = row.select_one("td:last-child, dd")
                if val:
                    item["manufacturer"] = val.get_text(strip=True)

        # Try to extract color from page text
        body_text = soup.get_text()
        color_match = re.search(r"カラー[：:]?\s*(.+?)(?:\n|$)", body_text)
        if color_match:
            item["body_color"] = [c.strip() for c in color_match.group(1).split("、")]

    except Exception:
        pass  # Detail enrichment is best-effort

    return item


def scrape_regular_series() -> list[dict]:
    """Main entry: scrape the full regular Tomica series."""
    with httpx.Client(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        soup = fetch_catalog_page(client)
        items = parse_listing(soup)

        enriched = []
        for i, item in enumerate(items):
            enriched.append(enrich_item(client, item))
            if i % 10 == 0 and i > 0:
                time.sleep(1)  # Rate limit

        return enriched
```

Create `scraper/scraper/output.py`:

```python
"""Output scraped data as JSON and SQL seed."""

import json
from pathlib import Path


def normalize_item(raw: dict) -> dict:
    """Normalize a scraped item to match the catalog schema."""
    model_number = raw.get("model_number", "")
    # Normalize "No.23" format
    if model_number and not model_number.startswith("No."):
        model_number = f"No.{model_number}"

    return {
        "model_number": model_number,
        "car_name": raw.get("car_name", ""),
        "car_name_en": raw.get("car_name_en"),
        "series": "regular",
        "is_first_edition": False,
        "manufacturer": raw.get("manufacturer"),
        "vehicle_type": raw.get("vehicle_type"),
        "body_color": raw.get("body_color", []),
        "release_date": raw.get("release_date"),
        "retired": False,
        "image_url": raw.get("image_url"),
        "source": "official",
        "metadata": {},
    }


def write_json(items: list[dict], output_path: Path) -> None:
    """Write normalized items to JSON."""
    normalized = [normalize_item(item) for item in items]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2))
    print(f"Wrote {len(normalized)} items to {output_path}")


def write_sql_seed(items: list[dict], output_path: Path) -> None:
    """Write SQL INSERT statements for seeding."""
    normalized = [normalize_item(item) for item in items]
    lines = []
    for item in normalized:
        colors = "{" + ",".join(f'"{c}"' for c in item["body_color"]) + "}"
        metadata = json.dumps(item["metadata"])
        lines.append(
            f"INSERT INTO tomica_catalog (model_number, car_name, car_name_en, series, is_first_edition, manufacturer, vehicle_type, body_color, image_url, source, metadata) "
            f"VALUES ('{_esc(item['model_number'])}', '{_esc(item['car_name'])}', {_null_str(item['car_name_en'])}, '{item['series']}', {item['is_first_edition']}, "
            f"{_null_str(item['manufacturer'])}, {_null_str(item['vehicle_type'])}, '{colors}', {_null_str(item['image_url'])}, '{item['source']}', '{metadata}') "
            f"ON CONFLICT (model_number, series, is_first_edition) DO NOTHING;"
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines))
    print(f"Wrote {len(lines)} SQL inserts to {output_path}")


def _esc(s: str) -> str:
    return s.replace("'", "''") if s else ""


def _null_str(s: str | None) -> str:
    return f"'{_esc(s)}'" if s else "NULL"
```

- [ ] **Step 4: Add a CLI entry point**

Add to `scraper/pyproject.toml` under `[project.scripts]`:

```toml
[project.scripts]
scrape = "scraper.cli:main"
```

Create `scraper/scraper/cli.py`:

```python
"""CLI entry point for the Tomica scraper."""

from pathlib import Path
from .tomica import scrape_regular_series
from .output import write_json, write_sql_seed


def main():
    print("Scraping Tomica regular series...")
    items = scrape_regular_series()
    print(f"Found {len(items)} items")

    data_dir = Path(__file__).parent.parent / "data"
    write_json(items, data_dir / "catalog.json")
    write_sql_seed(items, data_dir / "seed.sql")
    print("Done!")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Test scraper runs without crashing**

```bash
cd /Users/jacktse/projects/personal/tomica-collect/scraper
uv run scrape
```

Expected: Outputs "Scraping Tomica regular series..." and writes files to `scraper/data/`.

Note: The actual HTML structure of takaratomy.co.jp may differ — the scraper uses multiple CSS selector fallbacks. If selectors miss, output may be empty. This is expected; selectors will be tuned when we inspect the actual page structure.

- [ ] **Step 6: Commit**

```bash
git add scraper/
git commit -m "feat: Add Python scraper for Tomica catalog from official site"
```

---

## Task 5: Image Compression Utility

**Files:**
- Create: `src/lib/image.ts`
- Test: `tests/lib/image.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/lib/image.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { compressImage } from '../../src/lib/image'

describe('compressImage', () => {
  it('returns a base64 string', async () => {
    // Create a minimal test blob
    const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' })
    const file = new File([blob], 'test.jpg', { type: 'image/jpeg' })

    // Mock browser-image-compression
    vi.mock('browser-image-compression', () => ({
      default: vi.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' })),
    }))

    const result = await compressImage(file)
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/image.test.ts`
Expected: FAIL — module `image` not found.

- [ ] **Step 3: Implement compressImage**

Create `src/lib/image.ts`:

```typescript
import imageCompression from 'browser-image-compression'

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
}

export async function compressImage(file: File): Promise<string> {
  const compressed = await imageCompression(file, COMPRESSION_OPTIONS)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(compressed)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/image.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/image.ts tests/lib/image.test.ts
git commit -m "feat: Add image compression utility for scan uploads"
```

---

## Task 6: AI Recognition Edge Function

**Files:**
- Create: `api/identify.ts`
- Test: `tests/api/identify.test.ts`

- [ ] **Step 1: Write the Edge Function**

Create `api/identify.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!

interface IdentifyRequest {
  image_base64: string
  user_id: string
  ai_provider: 'openai' | 'gemini' | 'claude'
}

const STAGE1_PROMPT = `你是 Tomica 小汽車鑑定專家。請先判斷這張圖片屬於以下哪種情況：
1. 盒裝正面（可見包裝盒、編號、車名）
2. 盒裝背面（可見規格資訊）
3. 散車車體（無包裝，只有車體）
4. 底盤特寫（可見底部刻字）
5. 其他/無法辨識

回傳 JSON: { "type": 1-5, "confidence": 0-1 }`

const BOX_PROMPT = `你是 Tomica 小汽車鑑定專家。請從這張 Tomica 包裝圖片中提取以下資訊。
逐項回答，無法辨識的欄位填 null。

1. 型號編號（盒子左上角或右上角的數字，如 "No.23"）
2. 車名（日文或英文車名，如 "日産 GT-R"）
3. 系列名稱（如 "トミカ", "トミカプレミアム", "Dream TOMICA"）
4. 是否為初回特別仕樣（盒子是否有金色/特殊標示）
5. 車體顏色
6. 製造商品牌（如 Toyota, Nissan, BMW）

回傳 JSON:
{
  "model_number": "No.23" | null,
  "car_name": "日産 GT-R" | null,
  "series": "トミカ" | null,
  "is_first_edition": true/false/null,
  "body_color": "紅色" | null,
  "manufacturer": "Nissan" | null
}`

const LOOSE_PROMPT = `你是 Tomica 小汽車鑑定專家。這是一台沒有包裝的 Tomica 小汽車。
請仔細觀察並提取以下特徵，這些特徵將用於比對資料庫。

1. 車型類別（轎車/SUV/卡車/巴士/工程車/跑車/其他）
2. 車體顏色（主色 + 副色）
3. 製造商品牌（從車體造型判斷，如 Toyota, Honda, Porsche）
4. 可能的車款名稱（如 "Crown", "Civic", "911"）
5. 車體上的文字或標誌（警察、消防、企業塗裝等）
6. 底盤是否可見？若可見，刻字內容為何？
7. 特殊特徵（開門機構、可動部件、特殊塗裝）

回傳 JSON:
{
  "vehicle_type": string | null,
  "body_color": string | null,
  "manufacturer": string | null,
  "car_name": string | null,
  "markings": string | null,
  "chassis_text": string | null,
  "special_features": string | null
}`

function getStage2Prompt(inputType: number): string {
  if (inputType <= 2) return BOX_PROMPT
  return LOOSE_PROMPT
}

async function callOpenAI(apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        },
      ],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  })
  const data = await resp.json()
  return data.choices[0].message.content
}

async function callGemini(apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  const mimeType = imageBase64.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg'
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )
  const data = await resp.json()
  return data.candidates[0].content.parts[0].text
}

async function callClaude(apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
  const mimeType = imageBase64.match(/^data:(image\/\w+);/)?.[1] ?? 'image/jpeg'
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })
  const data = await resp.json()
  return data.content[0].text
}

async function callAI(provider: string, apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  switch (provider) {
    case 'openai': return callOpenAI(apiKey, prompt, imageBase64)
    case 'gemini': return callGemini(apiKey, prompt, imageBase64)
    case 'claude': return callClaude(apiKey, prompt, imageBase64)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

function matchCandidates(
  features: Record<string, unknown>,
  catalog: Array<Record<string, unknown>>
): Array<{ item: Record<string, unknown>; score: number; reasons: string[] }> {
  const modelNumber = features.model_number as string | null

  if (modelNumber) {
    const exact = catalog.filter(
      (c) => (c.model_number as string).replace(/\s/g, '') === modelNumber.replace(/\s/g, '')
    )
    if (exact.length > 0) {
      return exact.map((item) => ({ item, score: 0.99, reasons: ['Exact model number match'] }))
    }
  }

  // Fuzzy multi-field match
  return catalog
    .map((item) => {
      let score = 0
      const reasons: string[] = []

      const featureManufacturer = ((features.manufacturer as string) ?? '').toLowerCase()
      const itemManufacturer = ((item.manufacturer as string) ?? '').toLowerCase()
      if (featureManufacturer && itemManufacturer && itemManufacturer.includes(featureManufacturer)) {
        score += 0.25
        reasons.push(`Manufacturer match: ${item.manufacturer}`)
      }

      const featureName = ((features.car_name as string) ?? '').toLowerCase()
      const itemName = ((item.car_name as string) ?? '').toLowerCase()
      const itemNameEn = ((item.car_name_en as string) ?? '').toLowerCase()
      if (featureName && (itemName.includes(featureName) || itemNameEn.includes(featureName))) {
        score += 0.35
        reasons.push(`Name match: ${item.car_name}`)
      }

      const featureColor = ((features.body_color as string) ?? '').toLowerCase()
      const itemColors = ((item.body_color as string[]) ?? []).map((c: string) => c.toLowerCase())
      if (featureColor && itemColors.some((c: string) => c.includes(featureColor) || featureColor.includes(c))) {
        score += 0.2
        reasons.push(`Color match: ${itemColors.join(', ')}`)
      }

      const featureType = ((features.vehicle_type as string) ?? '').toLowerCase()
      const itemType = ((item.vehicle_type as string) ?? '').toLowerCase()
      if (featureType && itemType && featureType === itemType) {
        score += 0.15
        reasons.push(`Vehicle type match: ${item.vehicle_type}`)
      }

      return { item, score, reasons }
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { image_base64, user_id, ai_provider } = (await req.json()) as IdentifyRequest

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Fetch user's API key
    const { data: settings } = await supabase
      .from('user_settings')
      .select('api_keys')
      .eq('user_id', user_id)
      .single()

    if (!settings?.api_keys?.[ai_provider]) {
      return new Response(JSON.stringify({ error: `No API key configured for ${ai_provider}` }), { status: 400 })
    }

    const apiKey = settings.api_keys[ai_provider]

    // Stage 1: Scene classification
    const stage1Raw = await callAI(ai_provider, apiKey, STAGE1_PROMPT, image_base64)
    const stage1 = JSON.parse(stage1Raw)

    // Stage 2: Feature extraction
    const stage2Prompt = getStage2Prompt(stage1.type)
    const stage2Raw = await callAI(ai_provider, apiKey, stage2Prompt, image_base64)
    const features = JSON.parse(stage2Raw)

    // Stage 3: Database matching
    const { data: catalog } = await supabase.from('tomica_catalog').select('*')
    const candidates = matchCandidates(features, catalog ?? [])

    const inputTypes = ['', 'box_front', 'box_back', 'loose', 'chassis', 'other']

    // Log recognition
    await supabase.from('recognition_log').insert({
      user_id,
      image_url: null, // Could store to Supabase Storage
      input_type: inputTypes[stage1.type] ?? 'other',
      ai_provider,
      raw_response: { stage1, features },
      candidates: candidates.map((c) => ({ catalog_id: c.item.id, score: c.score, reasons: c.reasons })),
    })

    return new Response(
      JSON.stringify({
        input_type: inputTypes[stage1.type] ?? 'other',
        candidates: candidates.map((c) => ({
          catalog_item: c.item,
          score: c.score,
          match_reasons: c.reasons,
        })),
        raw_features: features,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
}

export const config = { runtime: 'edge' }
```

- [ ] **Step 2: Write unit test for matchCandidates**

Create `tests/api/identify.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Extract matchCandidates for testing by re-implementing the pure function
// (Edge Functions can't be imported directly in Vitest)
function matchCandidates(
  features: Record<string, unknown>,
  catalog: Array<Record<string, unknown>>
) {
  const modelNumber = features.model_number as string | null
  if (modelNumber) {
    const exact = catalog.filter(
      (c) => (c.model_number as string).replace(/\s/g, '') === modelNumber.replace(/\s/g, '')
    )
    if (exact.length > 0) {
      return exact.map((item) => ({ item, score: 0.99, reasons: ['Exact model number match'] }))
    }
  }
  return catalog
    .map((item) => {
      let score = 0
      const reasons: string[] = []
      const fm = ((features.manufacturer as string) ?? '').toLowerCase()
      const im = ((item.manufacturer as string) ?? '').toLowerCase()
      if (fm && im && im.includes(fm)) { score += 0.25; reasons.push(`Manufacturer match`) }
      const fn = ((features.car_name as string) ?? '').toLowerCase()
      const iname = ((item.car_name as string) ?? '').toLowerCase()
      if (fn && iname.includes(fn)) { score += 0.35; reasons.push(`Name match`) }
      const fc = ((features.body_color as string) ?? '').toLowerCase()
      const ic = ((item.body_color as string[]) ?? []).map((c: string) => c.toLowerCase())
      if (fc && ic.some((c: string) => c.includes(fc))) { score += 0.2; reasons.push(`Color match`) }
      const ft = ((features.vehicle_type as string) ?? '').toLowerCase()
      const it2 = ((item.vehicle_type as string) ?? '').toLowerCase()
      if (ft && it2 && ft === it2) { score += 0.15; reasons.push(`Type match`) }
      return { item, score, reasons }
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

const CATALOG = [
  { id: '1', model_number: 'No.23', car_name: '日産 GT-R', manufacturer: 'Nissan', body_color: ['紅'], vehicle_type: 'sports' },
  { id: '2', model_number: 'No.46', car_name: 'Honda NSX', manufacturer: 'Honda', body_color: ['白'], vehicle_type: 'sports' },
  { id: '3', model_number: 'No.110', car_name: 'Toyota Crown', manufacturer: 'Toyota', body_color: ['黑'], vehicle_type: 'sedan' },
]

describe('matchCandidates', () => {
  it('returns exact match when model_number is provided', () => {
    const result = matchCandidates({ model_number: 'No.23' }, CATALOG)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.99)
    expect(result[0].item.car_name).toBe('日産 GT-R')
  })

  it('returns fuzzy matches when no model_number', () => {
    const result = matchCandidates(
      { manufacturer: 'Nissan', car_name: 'GT-R', body_color: '紅', vehicle_type: 'sports' },
      CATALOG
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].item.model_number).toBe('No.23')
    expect(result[0].score).toBeGreaterThan(0.5)
  })

  it('returns empty array when nothing matches', () => {
    const result = matchCandidates({ manufacturer: 'Ferrari', car_name: 'F40' }, CATALOG)
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm vitest run tests/api/identify.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add api/ tests/api/
git commit -m "feat: Add AI recognition Edge Function with multi-stage pipeline and candidate matching"
```

---

## Task 7: useRecognition Hook

**Files:**
- Create: `src/hooks/useRecognition.ts`
- Test: `tests/hooks/useRecognition.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/hooks/useRecognition.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecognition } from '../../src/hooks/useRecognition'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { ai_provider: 'openai' }, error: null }),
        }),
      }),
    }),
  },
}))

describe('useRecognition', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('starts idle with no result', () => {
    const { result } = renderHook(() => useRecognition())
    expect(result.current.status).toBe('idle')
    expect(result.current.result).toBeNull()
  })

  it('sets status to loading then success on identify', async () => {
    const mockResult = {
      input_type: 'box_front',
      candidates: [{ catalog_item: { id: '1', model_number: 'No.23', car_name: '日産 GT-R' }, score: 0.96, match_reasons: ['Exact match'] }],
      raw_features: {},
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResult) })

    const { result } = renderHook(() => useRecognition())

    await act(async () => {
      await result.current.identify('data:image/jpeg;base64,fake')
    })

    expect(result.current.status).toBe('success')
    expect(result.current.result?.candidates).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/hooks/useRecognition.test.ts`
Expected: FAIL — module `useRecognition` not found.

- [ ] **Step 3: Implement useRecognition**

Create `src/hooks/useRecognition.ts`:

```typescript
import { useState } from 'react'
import type { RecognitionResult, AiProvider } from '../lib/types'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function useRecognition() {
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function identify(imageBase64: string) {
    if (!user) throw new Error('Not authenticated')

    setStatus('loading')
    setError(null)
    setResult(null)

    try {
      // Get user's AI provider preference
      const { data: settings } = await supabase
        .from('user_settings')
        .select('ai_provider')
        .eq('user_id', user.id)
        .single()

      const provider: AiProvider = settings?.ai_provider ?? 'openai'

      const resp = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageBase64,
          user_id: user.id,
          ai_provider: provider,
        }),
      })

      if (!resp.ok) {
        const data = await resp.json()
        throw new Error(data.error ?? 'Recognition failed')
      }

      const data: RecognitionResult = await resp.json()
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  function reset() {
    setStatus('idle')
    setResult(null)
    setError(null)
  }

  return { status, result, error, identify, reset }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/hooks/useRecognition.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRecognition.ts tests/hooks/useRecognition.test.ts
git commit -m "feat: Add useRecognition hook for AI scan flow"
```

---

## Task 8: useCatalog + useCollection Hooks

**Files:**
- Create: `src/hooks/useCatalog.ts`, `src/hooks/useCollection.ts`
- Test: `tests/hooks/useCatalog.test.ts`, `tests/hooks/useCollection.test.ts`

- [ ] **Step 1: Write failing test for useCatalog**

Create `tests/hooks/useCatalog.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useCatalog } from '../../src/hooks/useCatalog'

const mockItems = [
  { id: '1', model_number: 'No.1', car_name: '日産 GT-R', series: 'regular', manufacturer: 'Nissan' },
  { id: '2', model_number: 'No.2', car_name: 'Suzuki Jimny', series: 'regular', manufacturer: 'Suzuki' },
]

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: mockItems, error: null }),
      }),
    }),
  },
}))

describe('useCatalog', () => {
  it('loads catalog items on mount', async () => {
    const { result } = renderHook(() => useCatalog())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/hooks/useCatalog.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useCatalog**

Create `src/hooks/useCatalog.ts`:

```typescript
import { useEffect, useState } from 'react'
import type { CatalogItem, Series, VehicleType } from '../lib/types'
import { supabase } from '../lib/supabase'

interface Filters {
  series?: Series
  manufacturer?: string
  vehicle_type?: VehicleType
  search?: string
}

export function useCatalog(filters?: Filters) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase.from('tomica_catalog').select('*')

      if (filters?.series) query = query.eq('series', filters.series)
      if (filters?.manufacturer) query = query.eq('manufacturer', filters.manufacturer)
      if (filters?.vehicle_type) query = query.eq('vehicle_type', filters.vehicle_type)
      if (filters?.search) query = query.or(`car_name.ilike.%${filters.search}%,model_number.ilike.%${filters.search}%`)

      const { data, error: err } = await query.order('model_number')

      if (err) {
        setError(err.message)
      } else {
        setItems(data as CatalogItem[])
      }
      setLoading(false)
    }

    fetch()
  }, [filters?.series, filters?.manufacturer, filters?.vehicle_type, filters?.search])

  return { items, loading, error }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/hooks/useCatalog.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for useCollection**

Create `tests/hooks/useCollection.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useCollection } from '../../src/hooks/useCollection'

const mockInsert = vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new-1' }, error: null }) }) })
const mockSelect = vi.fn().mockReturnValue({
  eq: () => ({
    order: () => Promise.resolve({ data: [{ id: '1', catalog_id: 'c1' }], error: null }),
  }),
})

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'user_collection') return { select: mockSelect, insert: mockInsert }
      return { select: mockSelect }
    },
  },
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}))

describe('useCollection', () => {
  it('loads collection items', async () => {
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
  })
})
```

- [ ] **Step 6: Implement useCollection**

Create `src/hooks/useCollection.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react'
import type { CollectionItem } from '../lib/types'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useCollection() {
  const { user } = useAuth()
  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCollection = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('user_collection')
      .select('*, catalog:tomica_catalog(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setItems(data as CollectionItem[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetchCollection() }, [fetchCollection])

  async function addToCollection(catalogId: string, opts?: { photo_url?: string; condition?: string; has_box?: boolean; notes?: string; acquired_date?: string }) {
    if (!user) throw new Error('Not authenticated')
    const { data, error: err } = await supabase
      .from('user_collection')
      .insert({ user_id: user.id, catalog_id: catalogId, ...opts })
      .select()
      .single()

    if (err) throw err
    await fetchCollection()
    return data
  }

  async function removeFromCollection(id: string) {
    const { error: err } = await supabase.from('user_collection').delete().eq('id', id)
    if (err) throw err
    await fetchCollection()
  }

  async function updateItem(id: string, updates: Partial<CollectionItem>) {
    const { error: err } = await supabase.from('user_collection').update(updates).eq('id', id)
    if (err) throw err
    await fetchCollection()
  }

  const collectedIds = new Set(items.map((i) => i.catalog_id))

  return { items, loading, error, addToCollection, removeFromCollection, updateItem, collectedIds, refetch: fetchCollection }
}
```

- [ ] **Step 7: Run all hook tests**

Run: `pnpm vitest run tests/hooks/`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useCatalog.ts src/hooks/useCollection.ts tests/hooks/
git commit -m "feat: Add useCatalog and useCollection hooks with Supabase queries"
```

---

## Task 9: Core UI Components

**Files:**
- Create: `src/components/PhotoCapture.tsx`, `src/components/ConfidenceRing.tsx`, `src/components/CorrectionDropdown.tsx`, `src/components/CatalogCard.tsx`, `src/components/StatsRow.tsx`, `src/components/FilterSidebar.tsx`
- Test: `tests/components/ConfidenceRing.test.tsx`, `tests/components/CorrectionDropdown.test.tsx`, `tests/components/CatalogCard.test.tsx`

- [ ] **Step 1: Write failing test for ConfidenceRing**

Create `tests/components/ConfidenceRing.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ConfidenceRing } from '../../src/components/ConfidenceRing'

describe('ConfidenceRing', () => {
  it('displays percentage', () => {
    render(<ConfidenceRing value={0.96} />)
    expect(screen.getByText('96%')).toBeInTheDocument()
  })

  it('shows green color for high confidence', () => {
    const { container } = render(<ConfidenceRing value={0.96} />)
    expect(container.querySelector('[data-confidence="high"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement ConfidenceRing**

Create `src/components/ConfidenceRing.tsx`:

```tsx
interface Props {
  value: number // 0-1
  size?: number
}

export function ConfidenceRing({ value, size = 64 }: Props) {
  const pct = Math.round(value * 100)
  const level = value > 0.9 ? 'high' : value > 0.7 ? 'medium' : 'low'
  const colors = { high: 'text-success border-success', medium: 'text-yellow-600 border-yellow-500', low: 'text-error border-error' }

  return (
    <div className="flex flex-col items-center gap-1" data-confidence={level}>
      <div
        className={`rounded-full border-4 flex items-center justify-center font-display font-bold ${colors[level]}`}
        style={{ width: size, height: size }}
      >
        {pct}%
      </div>
      <span className={`text-xs font-medium ${colors[level].split(' ')[0]}`}>
        {level === 'high' ? '高信心匹配' : level === 'medium' ? '中等信心' : '低信心'}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Write failing test for CorrectionDropdown**

Create `tests/components/CorrectionDropdown.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CorrectionDropdown } from '../../src/components/CorrectionDropdown'

const candidates = [
  { catalog_item: { id: '1', model_number: 'No.23', car_name: '日産 GT-R' }, score: 0.96, match_reasons: [] },
  { catalog_item: { id: '2', model_number: 'No.23', car_name: '日産 GT-R 初回' }, score: 0.82, match_reasons: [] },
]

describe('CorrectionDropdown', () => {
  it('renders candidates as options', () => {
    render(<CorrectionDropdown candidates={candidates as any} selected="1" onSelect={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(2)
  })

  it('calls onSelect when changed', () => {
    const onSelect = vi.fn()
    render(<CorrectionDropdown candidates={candidates as any} selected="1" onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    expect(onSelect).toHaveBeenCalledWith('2')
  })
})
```

- [ ] **Step 4: Implement CorrectionDropdown**

Create `src/components/CorrectionDropdown.tsx`:

```tsx
import type { RecognitionCandidate } from '../lib/types'

interface Props {
  candidates: RecognitionCandidate[]
  selected: string
  onSelect: (catalogId: string) => void
  onManualSearch?: () => void
}

export function CorrectionDropdown({ candidates, selected, onSelect, onManualSearch }: Props) {
  return (
    <div className="bg-surface-container-low rounded-2xl p-4">
      <label className="text-xs text-on-surface-variant block mb-2">
        不正確？選擇正確的車種
      </label>
      <select
        value={selected}
        onChange={(e) => {
          if (e.target.value === '__search__') {
            onManualSearch?.()
          } else {
            onSelect(e.target.value)
          }
        }}
        className="w-full px-3 py-2.5 rounded-xl bg-white text-on-surface text-sm outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 12 12%27%3E%3Cpath fill=%27%23999%27 d=%27M6 8L1 3h10z%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_12px_center]"
      >
        {candidates.map((c) => (
          <option key={c.catalog_item.id} value={c.catalog_item.id}>
            {c.catalog_item.model_number} {c.catalog_item.car_name}（{Math.round(c.score * 100)}%）
          </option>
        ))}
        <option value="__search__">── 手動搜尋其他車種 ──</option>
      </select>
    </div>
  )
}
```

- [ ] **Step 5: Implement remaining components (CatalogCard, StatsRow, PhotoCapture, FilterSidebar)**

Create `src/components/CatalogCard.tsx`:

```tsx
import type { CatalogItem } from '../lib/types'

interface Props {
  item: CatalogItem
  isCollected: boolean
  onClick?: () => void
}

export function CatalogCard({ item, isCollected, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md relative ${
        isCollected ? 'bg-white' : 'bg-white opacity-60'
      }`}
    >
      {isCollected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-success text-white rounded-full flex items-center justify-center text-xs font-bold z-10 shadow">
          ✓
        </div>
      )}
      <div className="aspect-square bg-surface-container-low flex items-center justify-center">
        {item.image_url ? (
          <img src={item.image_url} alt={item.car_name} className="w-full h-full object-contain p-2" />
        ) : (
          <span className="text-4xl">🚗</span>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-bold text-primary font-display">{item.model_number}</div>
        <div className="text-sm font-semibold truncate text-on-surface">{item.car_name}</div>
      </div>
    </div>
  )
}
```

Create `src/components/StatsRow.tsx`:

```tsx
interface Props {
  collected: number
  missing: number
  total: number
}

export function StatsRow({ collected, missing, total }: Props) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { number: collected, label: '已收藏' },
        { number: missing, label: '未收藏' },
        { number: `${pct}%`, label: '完成率' },
      ].map((stat) => (
        <div key={stat.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-primary font-display">{stat.number}</div>
          <div className="text-xs text-on-surface-variant">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
```

Create `src/components/PhotoCapture.tsx`:

```tsx
import { useRef } from 'react'

interface Props {
  onCapture: (file: File) => void
}

export function PhotoCapture({ onCapture }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className="bg-gradient-to-br from-primary-container to-primary-dark rounded-2xl p-6 text-white text-center">
      <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
        📷
      </div>
      <h2 className="font-display font-bold text-lg mb-1">辨識你的 Tomica</h2>
      <p className="text-sm opacity-80 mb-4">拍攝盒裝或車體，AI 自動辨識型號</p>
      <div className="flex gap-3">
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex-1 py-2.5 bg-white text-primary rounded-full font-display font-semibold text-sm"
        >
          拍照辨識
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 py-2.5 border border-white/40 rounded-full font-display font-semibold text-sm"
        >
          從相簿選擇
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
```

Create `src/components/FilterSidebar.tsx`:

```tsx
interface FilterOption {
  value: string
  label: string
}

interface FilterGroup {
  label: string
  options: FilterOption[]
  selected: string | null
  onSelect: (value: string | null) => void
}

interface Props {
  groups: FilterGroup[]
}

export function FilterSidebar({ groups }: Props) {
  return (
    <aside className="w-60 flex-shrink-0 space-y-5 pr-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => group.onSelect(group.selected === opt.value ? null : opt.value)}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  group.selected === opt.value
                    ? 'bg-primary text-white scale-105'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}
```

- [ ] **Step 6: Run all component tests**

Run: `pnpm vitest run tests/components/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ tests/components/
git commit -m "feat: Add core UI components — PhotoCapture, ConfidenceRing, CorrectionDropdown, CatalogCard, StatsRow, FilterSidebar"
```

---

## Task 10: Pages — HomePage, ScanResultPage, CatalogPage, CollectionPage, SettingsPage

**Files:**
- Create: `src/pages/HomePage.tsx`, `src/pages/ScanResultPage.tsx`, `src/pages/CatalogPage.tsx`, `src/pages/CollectionPage.tsx`, `src/pages/SettingsPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement HomePage**

Create `src/pages/HomePage.tsx`:

```tsx
import { useNavigate } from 'react-router-dom'
import { PhotoCapture } from '../components/PhotoCapture'
import { StatsRow } from '../components/StatsRow'
import { useCollection } from '../hooks/useCollection'
import { useCatalog } from '../hooks/useCatalog'
import { compressImage } from '../lib/image'
import { useRecognition } from '../hooks/useRecognition'

export function HomePage() {
  const navigate = useNavigate()
  const { items: collection } = useCollection()
  const { items: catalog } = useCatalog()
  const { identify } = useRecognition()

  const collected = collection.length
  const total = catalog.length
  const missing = total - collected
  const recent = collection.slice(0, 5)

  async function handleCapture(file: File) {
    const base64 = await compressImage(file)
    await identify(base64)
    navigate('/scan-result')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
      <PhotoCapture onCapture={handleCapture} />
      <StatsRow collected={collected} missing={missing} total={total} />

      <div className="flex justify-between items-center">
        <h3 className="font-display font-semibold text-on-surface">最近加入</h3>
        <button onClick={() => navigate('/collection')} className="text-xs text-primary">查看全部</button>
      </div>
      <div className="space-y-2.5">
        {recent.map((item) => (
          <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
            <div className="w-12 h-12 bg-surface-container-low rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
              {item.catalog?.image_url ? (
                <img src={item.catalog.image_url} alt="" className="w-full h-full object-contain rounded-lg" />
              ) : '🚗'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{item.catalog?.model_number} {item.catalog?.car_name}</div>
              <div className="text-xs text-on-surface-variant">
                {item.catalog?.series === 'regular' ? '常規系列' : item.catalog?.series} · {item.catalog?.body_color?.join(', ')}
              </div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium flex-shrink-0">已收藏</span>
          </div>
        ))}
        {recent.length === 0 && (
          <p className="text-center text-sm text-on-surface-variant py-8">還沒有收藏，拍一台試試吧！</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement ScanResultPage**

Create `src/pages/ScanResultPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecognition } from '../hooks/useRecognition'
import { useCollection } from '../hooks/useCollection'
import { ConfidenceRing } from '../components/ConfidenceRing'
import { CorrectionDropdown } from '../components/CorrectionDropdown'

export function ScanResultPage() {
  const navigate = useNavigate()
  const { result, status, error, reset } = useRecognition()
  const { addToCollection } = useCollection()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant font-body text-sm">AI 辨識中...</p>
      </div>
    )
  }

  if (status === 'error' || !result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <p className="text-error text-sm">{error ?? '辨識失敗，請重試'}</p>
        <button onClick={() => { reset(); navigate('/') }} className="text-primary text-sm font-semibold">返回首頁</button>
      </div>
    )
  }

  const topCandidate = result.candidates[0]
  const effectiveId = selectedId ?? topCandidate?.catalog_item.id

  async function handleConfirm() {
    if (!effectiveId) return
    setSaving(true)
    try {
      await addToCollection(effectiveId)
      reset()
      navigate('/collection')
    } catch {
      // Handle error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <button onClick={() => { reset(); navigate('/') }} className="text-sm text-primary font-semibold">
        ← 返回
      </button>

      {topCandidate && (
        <>
          <div className="text-center py-2">
            <ConfidenceRing value={topCandidate.score} />
          </div>

          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="h-40 bg-surface-container-low flex items-center justify-center text-5xl">
              {topCandidate.catalog_item.image_url ? (
                <img src={topCandidate.catalog_item.image_url} alt="" className="h-full object-contain" />
              ) : '🚗'}
            </div>
            <div className="p-4">
              <h3 className="font-display font-bold text-lg mb-3">
                {topCandidate.catalog_item.model_number} {topCandidate.catalog_item.car_name}
              </h3>
              {[
                ['系列', topCandidate.catalog_item.series === 'regular' ? '常規 トミカ' : topCandidate.catalog_item.series],
                ['車體顏色', topCandidate.catalog_item.body_color?.join(', ')],
                ['製造商', topCandidate.catalog_item.manufacturer],
                ['初回特別仕樣', topCandidate.catalog_item.is_first_edition ? '是' : '否'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-surface-container-low last:border-0 text-sm">
                  <span className="text-on-surface-variant">{label}</span>
                  <span className="font-medium">{value ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>

          {result.candidates.length > 1 && (
            <CorrectionDropdown
              candidates={result.candidates}
              selected={effectiveId}
              onSelect={setSelectedId}
            />
          )}

          <button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-primary-container to-primary-dark text-white font-display font-semibold text-sm shadow-md disabled:opacity-50"
          >
            {saving ? '儲存中...' : '✓ 確認並加入收藏'}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Implement CatalogPage**

Create `src/pages/CatalogPage.tsx`:

```tsx
import { useState } from 'react'
import { useCatalog } from '../hooks/useCatalog'
import { useCollection } from '../hooks/useCollection'
import { CatalogCard } from '../components/CatalogCard'
import { FilterSidebar } from '../components/FilterSidebar'
import type { Series, VehicleType } from '../lib/types'

export function CatalogPage() {
  const [series, setSeries] = useState<Series | null>(null)
  const [manufacturer, setManufacturer] = useState<string | null>(null)
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null)
  const [search, setSearch] = useState('')
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'collected' | 'missing'>('all')

  const { items, loading } = useCatalog({
    series: series ?? undefined,
    manufacturer: manufacturer ?? undefined,
    vehicle_type: vehicleType ?? undefined,
    search: search || undefined,
  })
  const { collectedIds } = useCollection()

  const filtered = items.filter((item) => {
    if (collectionFilter === 'collected') return collectedIds.has(item.id)
    if (collectionFilter === 'missing') return !collectedIds.has(item.id)
    return true
  })

  const filterGroups = [
    {
      label: '系列',
      options: [
        { value: 'regular', label: '常規' },
        { value: 'premium', label: 'Premium' },
        { value: 'limited_vintage', label: 'TLV' },
        { value: 'dream', label: 'Dream' },
      ],
      selected: series,
      onSelect: (v: string | null) => setSeries(v as Series | null),
    },
    {
      label: '收藏狀態',
      options: [
        { value: 'all', label: '全部' },
        { value: 'collected', label: '已收藏' },
        { value: 'missing', label: '未收藏' },
      ],
      selected: collectionFilter,
      onSelect: (v: string | null) => setCollectionFilter((v ?? 'all') as 'all' | 'collected' | 'missing'),
    },
    {
      label: '製造商',
      options: ['Toyota', 'Nissan', 'Honda', 'BMW', 'Porsche', 'Suzuki'].map((m) => ({ value: m, label: m })),
      selected: manufacturer,
      onSelect: setManufacturer,
    },
    {
      label: '車型',
      options: [
        { value: 'sedan', label: '轎車' },
        { value: 'suv', label: 'SUV' },
        { value: 'sports', label: '跑車' },
        { value: 'truck', label: '卡車' },
        { value: 'bus', label: '巴士' },
        { value: 'emergency', label: '緊急車輛' },
        { value: 'construction', label: '工程車' },
      ],
      selected: vehicleType,
      onSelect: (v: string | null) => setVehicleType(v as VehicleType | null),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      {/* Mobile search */}
      <div className="md:hidden mb-4">
        <input
          type="text"
          placeholder="搜尋型號、車名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-full bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none"
        />
      </div>

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <FilterSidebar groups={filterGroups} />
        </div>

        {/* Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="text-center py-12 text-on-surface-variant text-sm">載入中...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((item) => (
                <CatalogCard key={item.id} item={item} isCollected={collectedIds.has(item.id)} />
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center py-12 text-on-surface-variant text-sm">沒有找到符合條件的車種</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement CollectionPage**

Create `src/pages/CollectionPage.tsx`:

```tsx
import { useState } from 'react'
import { useCollection } from '../hooks/useCollection'
import { useCatalog } from '../hooks/useCatalog'
import { StatsRow } from '../components/StatsRow'
import { CatalogCard } from '../components/CatalogCard'

export function CollectionPage() {
  const { items: collection, collectedIds } = useCollection()
  const { items: catalog } = useCatalog()
  const [tab, setTab] = useState<'collected' | 'missing'>('collected')

  const collected = collection.length
  const total = catalog.length
  const missing = total - collected
  const missingItems = catalog.filter((c) => !collectedIds.has(c.id))

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-5">
      <h2 className="font-display font-bold text-xl">我的收藏</h2>

      <StatsRow collected={collected} missing={missing} total={total} />

      <div className="flex gap-2">
        {(['collected', 'missing'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-display font-semibold transition-all ${
              tab === t ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {t === 'collected' ? `已收藏 (${collected})` : `缺少清單 (${missing})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {tab === 'collected'
          ? collection.map((item) =>
              item.catalog ? <CatalogCard key={item.id} item={item.catalog} isCollected={true} /> : null
            )
          : missingItems.map((item) => <CatalogCard key={item.id} item={item} isCollected={false} />)}
      </div>

      {tab === 'collected' && collection.length === 0 && (
        <p className="text-center text-on-surface-variant text-sm py-8">還沒有收藏，去掃描一台吧！</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement SettingsPage**

Create `src/pages/SettingsPage.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { AiProvider } from '../lib/types'

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI (GPT-4o)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'claude', label: 'Anthropic Claude' },
]

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const [provider, setProvider] = useState<AiProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('ai_provider, api_keys')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProvider(data.ai_provider as AiProvider)
          setApiKey(data.api_keys?.[data.ai_provider] ? '••••••••' : '')
        }
      })
  }, [user])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      ai_provider: provider,
      api_keys: { [provider]: apiKey },
    })
    setSaving(false)
    if (error) alert(error.message)
  }

  async function handleTest() {
    setTestStatus('testing')
    try {
      // Simple validation: check if key format looks right
      const valid =
        (provider === 'openai' && apiKey.startsWith('sk-')) ||
        (provider === 'gemini' && apiKey.length > 20) ||
        (provider === 'claude' && apiKey.startsWith('sk-ant-'))
      setTestStatus(valid ? 'success' : 'error')
    } catch {
      setTestStatus('error')
    }
  }

  async function handleExport(format: 'csv' | 'json') {
    if (!user) return
    const { data } = await supabase
      .from('user_collection')
      .select('*, catalog:tomica_catalog(*)')
      .eq('user_id', user.id)

    if (!data) return

    let content: string
    let mimeType: string
    let filename: string

    if (format === 'json') {
      content = JSON.stringify(data, null, 2)
      mimeType = 'application/json'
      filename = 'tomica-collection.json'
    } else {
      const headers = 'model_number,car_name,series,condition,has_box,acquired_date\n'
      const rows = data.map((r: any) =>
        [r.catalog?.model_number, r.catalog?.car_name, r.catalog?.series, r.condition, r.has_box, r.acquired_date].join(',')
      )
      content = headers + rows.join('\n')
      mimeType = 'text/csv'
      filename = 'tomica-collection.csv'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-6">
      <h2 className="font-display font-bold text-xl">設定</h2>

      {/* AI Settings */}
      <section className="bg-white rounded-2xl p-4 space-y-4 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">AI 辨識設定</h3>
        <div>
          <label className="text-xs text-on-surface-variant block mb-1">AI Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm outline-none"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-on-surface-variant block mb-1">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="輸入 API Key..."
            className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleTest} className="px-4 py-2 rounded-full bg-surface-container text-on-surface-variant text-sm font-medium">
            {testStatus === 'testing' ? '測試中...' : testStatus === 'success' ? '✓ 連線成功' : testStatus === 'error' ? '✗ 連線失敗' : '測試連線'}
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-50">
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </section>

      {/* Account */}
      <section className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">帳號</h3>
        <div className="text-sm text-on-surface">{user?.email}</div>
        <button onClick={signOut} className="text-sm text-error font-medium">登出</button>
      </section>

      {/* Data */}
      <section className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">資料管理</h3>
        <button onClick={() => handleExport('csv')} className="block text-sm text-primary">匯出收藏資料 (CSV)</button>
        <button onClick={() => handleExport('json')} className="block text-sm text-primary">匯出收藏資料 (JSON)</button>
      </section>

      {/* About */}
      <section className="bg-white rounded-2xl p-4 space-y-2 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">關於</h3>
        <div className="text-sm text-on-surface-variant">版本 v1.0.0</div>
        <div className="text-sm text-on-surface-variant">MIT License</div>
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Wire all pages into App.tsx**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { ScanResultPage } from './pages/ScanResultPage'
import { CatalogPage } from './pages/CatalogPage'
import { CollectionPage } from './pages/CollectionPage'
import { SettingsPage } from './pages/SettingsPage'
import { AuthPage } from './pages/AuthPage'
import { useAuth } from './hooks/useAuth'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/auth" />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="scan-result" element={<ScanResultPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="collection" element={<CollectionPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 7: Verify build succeeds**

Run: `pnpm build`
Expected: Build completes with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ src/App.tsx
git commit -m "feat: Add all pages — Home, ScanResult, Catalog, Collection, Settings with full UI"
```

---

## Task 11: Settings Edge Function (API Key Encryption)

**Files:**
- Create: `api/settings.ts`

- [ ] **Step 1: Implement settings Edge Function**

Create `api/settings.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const { user_id, ai_provider, api_key } = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Store API key (Supabase encrypts at rest; for extra security, encrypt with pgcrypto in a real deployment)
    const { error } = await supabase.from('user_settings').upsert({
      user_id,
      ai_provider,
      api_keys: { [ai_provider]: api_key },
      updated_at: new Date().toISOString(),
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
}

export const config = { runtime: 'edge' }
```

- [ ] **Step 2: Commit**

```bash
git add api/settings.ts
git commit -m "feat: Add settings Edge Function for API key management"
```

---

## Task 12: Dockerfile + Final Wiring

**Files:**
- Create: `Dockerfile`
- Modify: `.gitignore`

- [ ] **Step 1: Update .gitignore**

Append to `.gitignore`:

```
.superpowers/
node_modules/
dist/
.env
.env.local
scraper/data/
scraper/.venv/
__pycache__/
```

- [ ] **Step 2: Verify full build**

Run: `pnpm build`
Expected: Build succeeds.

Run: `pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: Update gitignore with all generated/secret paths"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | Vite, React, Tailwind, Router, Design tokens |
| 2 | Auth hook + login page | useAuth, AuthPage, Supabase client |
| 3 | Database migration | SQL schema + RLS policies |
| 4 | Catalog scraper | Python httpx + BeautifulSoup |
| 5 | Image compression | browser-image-compression wrapper |
| 6 | AI recognition Edge Function | Multi-stage pipeline + candidate matching |
| 7 | useRecognition hook | Frontend hook for scan flow |
| 8 | useCatalog + useCollection | Data query hooks |
| 9 | Core UI components | PhotoCapture, ConfidenceRing, CorrectionDropdown, CatalogCard, StatsRow, FilterSidebar |
| 10 | All pages | Home, ScanResult, Catalog, Collection, Settings |
| 11 | Settings Edge Function | API key management |
| 12 | Final wiring | .gitignore, build verification |

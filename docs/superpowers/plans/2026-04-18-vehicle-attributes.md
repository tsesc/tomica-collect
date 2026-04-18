# Vehicle Attributes Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich 2,118 catalog items with AI-extracted visual attributes (color, vehicle type, features) to enable attribute-based filtering in the UI and pre-filtering in the AI recognition pipeline.

**Architecture:** Add `attributes JSONB` column to DB → batch-analyze catalog images via Gemini Flash → enhance matchCandidates with pre-filter + expanded scoring → add attribute filter chips to catalog UI.

**Tech Stack:** Supabase (Postgres JSONB + GIN index), Gemini Flash Vision API (Python httpx), React (filter chips), Cloudflare Pages Functions (enhanced matching)

---

### Task 1: Add attributes column to DB + TypeScript type

**Files:**
- Create: `supabase/migrations/003_add_attributes.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create migration SQL**

```sql
-- supabase/migrations/003_add_attributes.sql
ALTER TABLE tomica_catalog ADD COLUMN IF NOT EXISTS attributes JSONB;
CREATE INDEX IF NOT EXISTS idx_catalog_attributes ON tomica_catalog USING GIN (attributes);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- project_id: `qhvtipfmxfdlpolckubb`
- name: `add_attributes_column`
- query: the SQL from step 1

- [ ] **Step 3: Add VehicleAttributes interface and update CatalogItem**

In `src/lib/types.ts`, add before `CatalogItem`:

```typescript
export interface VehicleAttributes {
  vehicle_category: 'car' | 'truck' | 'bus' | 'emergency' | 'construction' | 'motorcycle' | 'aircraft' | 'boat' | 'train' | 'fantasy'
  body_style: 'sedan' | 'suv' | 'coupe' | 'wagon' | 'van' | 'pickup' | 'convertible' | 'hatchback' | 'cab_over' | 'special'
  primary_color: string
  secondary_color: string | null
  wheel_count: number
  size_class: 'small' | 'medium' | 'large' | 'extra_large'
  features: string[]
  era_style: 'classic' | 'modern' | 'futuristic' | 'retro'
  has_livery: boolean
  window_style: 'standard' | 'none' | 'panoramic' | 'cab'
}
```

Add to `CatalogItem` interface:
```typescript
  attributes: VehicleAttributes | null
```

- [ ] **Step 4: Build to verify types compile**

Run: `pnpm build`
Expected: Build succeeds (no type errors)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/003_add_attributes.sql src/lib/types.ts
git commit -m "feat: Add attributes JSONB column + VehicleAttributes type"
```

---

### Task 2: Build batch attribute extraction scraper

**Files:**
- Create: `scraper/scraper/enrich.py`
- Modify: `scraper/scraper/cli.py`
- Modify: `scraper/pyproject.toml`

- [ ] **Step 1: Add google-generativeai dependency**

In `scraper/pyproject.toml`, add to dependencies:
```toml
dependencies = [
    "beautifulsoup4>=4.14.3",
    "httpx>=0.28.1",
    "lxml>=6.0.3",
    "google-generativeai>=0.8.0",
]
```

Run: `cd scraper && uv sync`

- [ ] **Step 2: Create enrich.py with Gemini Vision batch analyzer**

Create `scraper/scraper/enrich.py`:

```python
"""Batch-enrich catalog items with visual attributes via Gemini Flash."""

import asyncio
import json
import os
import httpx

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

PROMPT = """Analyze this Tomica die-cast miniature car/vehicle product image.
Return a JSON object with exactly these fields:
{
  "vehicle_category": one of ["car", "truck", "bus", "emergency", "construction", "motorcycle", "aircraft", "boat", "train", "fantasy"],
  "body_style": one of ["sedan", "suv", "coupe", "wagon", "van", "pickup", "convertible", "hatchback", "cab_over", "special"],
  "primary_color": lowercase color name (e.g., "red", "blue", "white", "silver", "black", "yellow", "green", "orange", "brown", "gray", "pink", "gold"),
  "secondary_color": second color if two-tone, or null,
  "wheel_count": number of visible wheels (2, 4, 6, 8, or 0 for boats/aircraft),
  "size_class": one of ["small", "medium", "large", "extra_large"] relative to a standard sedan,
  "features": array of applicable features from ["police_light", "ladder", "wing", "blade", "crane", "antenna", "decal", "open_top", "tank", "trailer"],
  "era_style": one of ["classic", "modern", "futuristic", "retro"],
  "has_livery": true if the vehicle has printed livery/stripes/company logos, false otherwise,
  "window_style": one of ["standard", "none", "panoramic", "cab"]
}
Return ONLY valid JSON, no explanation."""

VALID_CATEGORIES = {"car", "truck", "bus", "emergency", "construction", "motorcycle", "aircraft", "boat", "train", "fantasy"}
VALID_BODY_STYLES = {"sedan", "suv", "coupe", "wagon", "van", "pickup", "convertible", "hatchback", "cab_over", "special"}
VALID_SIZE_CLASSES = {"small", "medium", "large", "extra_large"}
VALID_ERA_STYLES = {"classic", "modern", "futuristic", "retro"}
VALID_WINDOW_STYLES = {"standard", "none", "panoramic", "cab"}
VALID_FEATURES = {"police_light", "ladder", "wing", "blade", "crane", "antenna", "decal", "open_top", "tank", "trailer"}


def validate_attributes(data: dict) -> dict | None:
    """Validate and normalize AI response. Returns None if invalid."""
    try:
        if data.get("vehicle_category") not in VALID_CATEGORIES:
            return None
        if data.get("body_style") not in VALID_BODY_STYLES:
            return None
        if data.get("size_class") not in VALID_SIZE_CLASSES:
            return None
        if data.get("era_style") not in VALID_ERA_STYLES:
            return None
        if data.get("window_style") not in VALID_WINDOW_STYLES:
            return None

        wheel_count = data.get("wheel_count", 4)
        if not isinstance(wheel_count, int) or wheel_count not in (0, 2, 4, 6, 8):
            wheel_count = 4

        features = data.get("features", [])
        if not isinstance(features, list):
            features = []
        features = [f for f in features if f in VALID_FEATURES]

        primary_color = data.get("primary_color", "unknown")
        if not isinstance(primary_color, str):
            primary_color = "unknown"

        secondary_color = data.get("secondary_color")
        if secondary_color is not None and not isinstance(secondary_color, str):
            secondary_color = None

        has_livery = bool(data.get("has_livery", False))

        return {
            "vehicle_category": data["vehicle_category"],
            "body_style": data["body_style"],
            "primary_color": primary_color.lower().strip(),
            "secondary_color": secondary_color.lower().strip() if secondary_color else None,
            "wheel_count": wheel_count,
            "size_class": data["size_class"],
            "features": features,
            "era_style": data["era_style"],
            "has_livery": has_livery,
            "window_style": data["window_style"],
        }
    except (KeyError, TypeError):
        return None


async def analyze_image(client: httpx.AsyncClient, api_key: str, image_url: str) -> dict | None:
    """Send image to Gemini Flash and extract attributes."""
    # Fetch image
    try:
        img_resp = await client.get(image_url, timeout=15)
        if img_resp.status_code != 200:
            return None
        img_bytes = img_resp.content
        content_type = img_resp.headers.get("content-type", "image/jpeg")
        if "png" in content_type:
            mime = "image/png"
        elif "webp" in content_type:
            mime = "image/webp"
        else:
            mime = "image/jpeg"
    except Exception:
        return None

    import base64
    b64 = base64.b64encode(img_bytes).decode()

    # Call Gemini
    try:
        resp = await client.post(
            f"{GEMINI_API_URL}?key={api_key}",
            json={
                "contents": [{"parts": [
                    {"text": PROMPT},
                    {"inline_data": {"mime_type": mime, "data": b64}},
                ]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=30,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        return validate_attributes(parsed)
    except Exception:
        return None


async def enrich_batch(items: list[dict], api_key: str, concurrency: int = 10) -> dict:
    """Enrich a batch of items. Returns stats dict."""
    semaphore = asyncio.Semaphore(concurrency)
    stats = {"enriched": 0, "failed": 0, "skipped": 0}
    results: list[tuple[str, dict | None]] = []

    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0"},
        follow_redirects=True,
    ) as client:

        async def process(item: dict) -> tuple[str, dict | None]:
            async with semaphore:
                image_url = item.get("image_url")
                if not image_url:
                    stats["skipped"] += 1
                    return (item["id"], None)

                attrs = await analyze_image(client, api_key, image_url)
                if attrs:
                    stats["enriched"] += 1
                else:
                    # Retry once
                    await asyncio.sleep(1)
                    attrs = await analyze_image(client, api_key, image_url)
                    if attrs:
                        stats["enriched"] += 1
                    else:
                        stats["failed"] += 1

                await asyncio.sleep(0.1)  # Rate limit
                return (item["id"], attrs)

        tasks = [process(item) for item in items]
        results = await asyncio.gather(*tasks)

    return {"stats": stats, "results": results}
```

- [ ] **Step 3: Add CLI command for enrich-attributes**

In `scraper/scraper/cli.py`, add import:
```python
from .enrich import enrich_batch
```

Add new elif block before the `else:` (regular scrape) block:
```python
    elif len(args) >= 1 and args[0] == "enrich-attributes":
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            print("Error: GEMINI_API_KEY environment variable not set")
            sys.exit(1)

        # Query DB for items needing enrichment
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not supabase_url or not supabase_key:
            print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
            sys.exit(1)

        import httpx as httpx_sync
        headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
        base = f"{supabase_url}/rest/v1"

        # Fetch items with image_url but no attributes
        print("Fetching items needing enrichment...")
        resp = httpx_sync.get(
            f"{base}/tomica_catalog?image_url=not.is.null&attributes=is.null&select=id,model_number,car_name,image_url",
            headers=headers, timeout=30,
        )
        items = resp.json()
        print(f"Found {len(items)} items to enrich")

        if not items:
            print("Nothing to enrich!")
            return

        # Run batch enrichment
        result = asyncio.run(enrich_batch(items, api_key))
        stats = result["stats"]
        print(f"\nResults: {stats['enriched']} enriched, {stats['failed']} failed, {stats['skipped']} skipped")

        # Write results back to DB
        success = 0
        for item_id, attrs in result["results"]:
            if attrs is None:
                continue
            patch_resp = httpx_sync.patch(
                f"{base}/tomica_catalog?id=eq.{item_id}",
                headers={**headers, "Content-Type": "application/json", "Prefer": "return=minimal"},
                json={"attributes": attrs},
                timeout=10,
            )
            if patch_resp.status_code < 300:
                success += 1
        print(f"Wrote {success} attributes to DB")
        print("Done!")
```

- [ ] **Step 4: Test the scraper imports correctly**

Run: `cd scraper && uv run python -c "from scraper.enrich import validate_attributes; print('OK')"`
Expected: prints `OK`

- [ ] **Step 5: Commit**

```bash
git add scraper/scraper/enrich.py scraper/scraper/cli.py scraper/pyproject.toml
git commit -m "feat: Add batch attribute extraction via Gemini Flash"
```

---

### Task 3: Run batch enrichment

**Files:** No new files (runtime task)

- [ ] **Step 1: Run the enrichment command**

```bash
cd scraper
GEMINI_API_KEY=<key> \
SUPABASE_URL=https://qhvtipfmxfdlpolckubb.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
uv run scrape enrich-attributes
```

This will take a few minutes for ~1,500 items with images.

- [ ] **Step 2: Verify enrichment in DB**

Use Supabase MCP `execute_sql`:
```sql
SELECT
  count(*) as total,
  count(attributes) as enriched,
  count(*) - count(attributes) as remaining
FROM tomica_catalog;
```

Expected: enriched should be ~1,500+ (items with images)

- [ ] **Step 3: Spot-check attribute quality**

```sql
SELECT model_number, car_name,
  attributes->>'vehicle_category' as category,
  attributes->>'primary_color' as color,
  attributes->>'body_style' as style
FROM tomica_catalog
WHERE attributes IS NOT NULL
LIMIT 10;
```

Verify attributes look correct for known vehicles.

---

### Task 4: Enhance matchCandidates with pre-filter + expanded scoring

**Files:**
- Modify: `functions/api/identify.ts`
- Modify: `tests/api/identify.test.ts`

- [ ] **Step 1: Write failing tests for enhanced matchCandidates**

Add to `tests/api/identify.test.ts`:

```typescript
const CATALOG_WITH_ATTRS = [
  { id: '1', model_number: 'No.23', car_name: '日産 GT-R', car_name_en: 'Nissan GT-R', manufacturer: 'Nissan', body_color: ['紅'], vehicle_type: 'sports',
    attributes: { vehicle_category: 'car', body_style: 'coupe', primary_color: 'red', secondary_color: null, wheel_count: 4, size_class: 'medium', features: [], era_style: 'modern', has_livery: false, window_style: 'standard' } },
  { id: '2', model_number: 'No.46', car_name: 'Honda NSX', car_name_en: 'Honda NSX', manufacturer: 'Honda', body_color: ['白'], vehicle_type: 'sports',
    attributes: { vehicle_category: 'car', body_style: 'coupe', primary_color: 'white', secondary_color: null, wheel_count: 4, size_class: 'medium', features: [], era_style: 'modern', has_livery: false, window_style: 'standard' } },
  { id: '3', model_number: 'No.110', car_name: 'Toyota Crown', car_name_en: 'Toyota Crown', manufacturer: 'Toyota', body_color: ['黑'], vehicle_type: 'sedan',
    attributes: { vehicle_category: 'car', body_style: 'sedan', primary_color: 'black', secondary_color: null, wheel_count: 4, size_class: 'medium', features: [], era_style: 'modern', has_livery: false, window_style: 'standard' } },
  { id: '4', model_number: 'No.75', car_name: 'Honda NSX パトロールカー', car_name_en: null, manufacturer: 'Honda', body_color: ['白', '黒'], vehicle_type: 'emergency',
    attributes: { vehicle_category: 'emergency', body_style: 'coupe', primary_color: 'white', secondary_color: 'black', wheel_count: 4, size_class: 'medium', features: ['police_light'], era_style: 'modern', has_livery: true, window_style: 'standard' } },
]

describe('matchCandidates with attributes', () => {
  it('scores higher when attributes match', () => {
    const result = matchCandidates(
      { manufacturer: 'Honda', body_color: 'white', vehicle_type: 'sports', vehicle_category: 'car', primary_color: 'white', body_style: 'coupe' },
      CATALOG_WITH_ATTRS
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].item.model_number).toBe('No.46')
  })

  it('attribute features overlap adds score', () => {
    const result = matchCandidates(
      { manufacturer: 'Honda', vehicle_category: 'emergency', primary_color: 'white', features: ['police_light'] },
      CATALOG_WITH_ATTRS
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].item.model_number).toBe('No.75')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/identify.test.ts`
Expected: New tests fail (matchCandidates doesn't check attributes yet)

- [ ] **Step 3: Update matchCandidates with attribute-aware scoring**

Replace the `matchCandidates` function in `functions/api/identify.ts`:

```typescript
export function matchCandidates(
  features: Record<string, unknown>,
  catalog: Array<Record<string, unknown>>
): Array<{ item: Record<string, unknown>; score: number; reasons: string[] }> {
  const modelNumber = features.model_number as string | null
  if (modelNumber) {
    const exact = catalog.filter((c) => (c.model_number as string).replace(/\s/g, '') === modelNumber.replace(/\s/g, ''))
    if (exact.length > 0) return exact.map((item) => ({ item, score: 0.99, reasons: ['Exact model number match'] }))
  }

  return catalog
    .map((item) => {
      let score = 0
      const reasons: string[] = []
      const attrs = item.attributes as Record<string, unknown> | null

      // Manufacturer match (0.20)
      const fm = ((features.manufacturer as string) ?? '').toLowerCase()
      const im = ((item.manufacturer as string) ?? '').toLowerCase()
      if (fm && im && im.includes(fm)) { score += 0.20; reasons.push(`Manufacturer: ${item.manufacturer}`) }

      // Car name match (0.30)
      const fn = ((features.car_name as string) ?? '').toLowerCase()
      const iname = ((item.car_name as string) ?? '').toLowerCase()
      const inameEn = ((item.car_name_en as string) ?? '').toLowerCase()
      if (fn && (iname.includes(fn) || inameEn.includes(fn))) { score += 0.30; reasons.push(`Name: ${item.car_name}`) }

      // Attribute-based scoring (only if item has attributes)
      if (attrs) {
        // Primary color match (0.15)
        const fColor = ((features.primary_color as string) ?? (features.body_color as string) ?? '').toLowerCase()
        const iColor = ((attrs.primary_color as string) ?? '').toLowerCase()
        const iColor2 = ((attrs.secondary_color as string) ?? '').toLowerCase()
        if (fColor && (iColor.includes(fColor) || fColor.includes(iColor) || iColor2.includes(fColor))) {
          score += 0.15; reasons.push(`Color: ${iColor}`)
        }

        // Vehicle category match (0.10)
        const fCat = ((features.vehicle_category as string) ?? (features.vehicle_type as string) ?? '').toLowerCase()
        const iCat = ((attrs.vehicle_category as string) ?? '').toLowerCase()
        if (fCat && iCat && fCat === iCat) { score += 0.10; reasons.push(`Category: ${iCat}`) }

        // Body style match (0.08)
        const fStyle = ((features.body_style as string) ?? '').toLowerCase()
        const iStyle = ((attrs.body_style as string) ?? '').toLowerCase()
        if (fStyle && iStyle && fStyle === iStyle) { score += 0.08; reasons.push(`Style: ${iStyle}`) }

        // Features overlap (0.10)
        const fFeats = (features.features as string[]) ?? []
        const iFeats = (attrs.features as string[]) ?? []
        if (fFeats.length > 0 && iFeats.length > 0) {
          const overlap = fFeats.filter((f: string) => iFeats.includes(f))
          if (overlap.length > 0) { score += 0.10; reasons.push(`Features: ${overlap.join(', ')}`) }
        }

        // Size class match (0.05)
        const fSize = ((features.size_class as string) ?? '').toLowerCase()
        const iSize = ((attrs.size_class as string) ?? '').toLowerCase()
        if (fSize && iSize && fSize === iSize) { score += 0.05; reasons.push(`Size: ${iSize}`) }

        // Era style match (0.02)
        const fEra = ((features.era_style as string) ?? '').toLowerCase()
        const iEra = ((attrs.era_style as string) ?? '').toLowerCase()
        if (fEra && iEra && fEra === iEra) { score += 0.02; reasons.push(`Era: ${iEra}`) }
      } else {
        // Fallback for items without attributes: use old scoring
        const fc = ((features.body_color as string) ?? '').toLowerCase()
        const ic = ((item.body_color as string[]) ?? []).map((c: string) => c.toLowerCase())
        if (fc && ic.some((c: string) => c.includes(fc) || fc.includes(c))) { score += 0.15; reasons.push(`Color: ${ic.join(', ')}`) }

        const ft = ((features.vehicle_type as string) ?? '').toLowerCase()
        const it2 = ((item.vehicle_type as string) ?? '').toLowerCase()
        if (ft && it2 && ft === it2) { score += 0.10; reasons.push(`Type: ${item.vehicle_type}`) }
      }

      return { item, score, reasons }
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/identify.test.ts`
Expected: All 5 tests pass (3 existing + 2 new)

- [ ] **Step 5: Build to verify TypeScript compiles**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add functions/api/identify.ts tests/api/identify.test.ts
git commit -m "feat: Enhance matchCandidates with attribute-aware scoring"
```

---

### Task 5: Add attribute filters to useCatalog hook

**Files:**
- Modify: `src/hooks/useCatalog.ts`

- [ ] **Step 1: Add attribute filter types to Filters interface**

```typescript
interface Filters {
  series?: Series
  numberRange?: NumberRange
  source?: SourceFilter
  year?: number
  search?: string
  vehicleCategory?: string
  primaryColors?: string[]
  features?: string[]
}
```

- [ ] **Step 2: Add JSONB filter queries to the hook**

After the existing search filter, add:

```typescript
      if (filters?.vehicleCategory) {
        query = query.eq('attributes->>vehicle_category', filters.vehicleCategory)
      }

      if (filters?.primaryColors && filters.primaryColors.length > 0) {
        query = query.in('attributes->>primary_color', filters.primaryColors)
      }

      if (filters?.features && filters.features.length > 0) {
        for (const feat of filters.features) {
          query = query.contains('attributes->features', JSON.stringify([feat]))
        }
      }
```

Add to useEffect dependency array: `filters?.vehicleCategory, filters?.primaryColors, filters?.features`

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCatalog.ts
git commit -m "feat: Add attribute-based JSONB filters to useCatalog"
```

---

### Task 6: Add attribute filter chips to CatalogPage

**Files:**
- Modify: `src/pages/CatalogPage.tsx`

- [ ] **Step 1: Add filter state and constants**

Add these constants after existing ones:

```typescript
const VEHICLE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'car', label: '轎車' },
  { value: 'emergency', label: '緊急' },
  { value: 'truck', label: '卡車' },
  { value: 'bus', label: '巴士' },
  { value: 'construction', label: '工程' },
  { value: 'motorcycle', label: '機車' },
  { value: 'train', label: '列車' },
  { value: 'fantasy', label: '造型' },
]

const COLOR_OPTIONS: { value: string; label: string; hex: string }[] = [
  { value: 'red', label: '紅', hex: '#DC2626' },
  { value: 'blue', label: '藍', hex: '#2563EB' },
  { value: 'white', label: '白', hex: '#F9FAFB' },
  { value: 'black', label: '黑', hex: '#1F2937' },
  { value: 'silver', label: '銀', hex: '#9CA3AF' },
  { value: 'yellow', label: '黃', hex: '#EAB308' },
  { value: 'green', label: '綠', hex: '#16A34A' },
  { value: 'orange', label: '橙', hex: '#EA580C' },
]
```

Add state:
```typescript
  const [vehicleCategory, setVehicleCategory] = useState<string | null>(null)
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
```

- [ ] **Step 2: Wire state into useCatalog call**

Update the useCatalog call to pass new filters:
```typescript
  const { items, loading } = useCatalog({
    series,
    numberRange: (search || year || !isRegular) ? undefined : (numberRange ?? '1-30'),
    source: (isRegular && source !== 'all') ? source : undefined,
    year: year ?? undefined,
    search: debouncedSearch || undefined,
    vehicleCategory: vehicleCategory ?? undefined,
    primaryColors: selectedColors.length > 0 ? selectedColors : undefined,
    features: selectedFeatures.length > 0 ? selectedFeatures : undefined,
  })
```

- [ ] **Step 3: Add filter chip UI after the existing source/collection row**

Add a new filter row after the existing filter chips div:

```tsx
      {/* Attribute filter chips */}
      <div className="mb-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 min-w-max items-center">
          {/* Vehicle category */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">車型</span>
            {VEHICLE_CATEGORIES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVehicleCategory(vehicleCategory === opt.value ? null : opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${vehicleCategory === opt.value
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-white text-on-surface-variant border border-outline-variant/20 hover:bg-surface-container-low'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-outline-variant/30" />

          {/* Color filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">顏色</span>
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedColors((prev) =>
                  prev.includes(opt.value) ? prev.filter((c) => c !== opt.value) : [...prev, opt.value]
                )}
                className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center
                  ${selectedColors.includes(opt.value) ? 'border-primary scale-110' : 'border-outline-variant/30'}`}
                style={{ backgroundColor: opt.hex }}
                title={opt.label}
              >
                {selectedColors.includes(opt.value) && (
                  <span className={`text-[10px] font-bold ${opt.value === 'white' || opt.value === 'yellow' ? 'text-on-surface' : 'text-white'}`}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
```

- [ ] **Step 4: Build and test**

Run: `pnpm build && npx vitest run`
Expected: Build succeeds, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/CatalogPage.tsx
git commit -m "feat: Add vehicle type and color filter chips to catalog"
```

---

### Task 7: Show attributes in CarDetailModal

**Files:**
- Modify: `src/components/CarDetailModal.tsx`

- [ ] **Step 1: Add attribute display to detail grid**

After the existing detail grid items (around line 120), add attribute display:

```tsx
            {/* Attributes section */}
            {item.attributes && (
              <>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車型</div>
                  <div className="font-medium text-on-surface">
                    {{ car: '轎車', truck: '卡車', bus: '巴士', emergency: '緊急車輛', construction: '工程車', motorcycle: '機車', aircraft: '飛機', boat: '船', train: '列車', fantasy: '造型車' }[item.attributes.vehicle_category] ?? item.attributes.vehicle_category}
                    {' / '}
                    {{ sedan: '四門', suv: 'SUV', coupe: '雙門', wagon: '旅行', van: '箱型', pickup: '皮卡', convertible: '敞篷', hatchback: '掀背', cab_over: '平頭', special: '特殊' }[item.attributes.body_style] ?? item.attributes.body_style}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車色</div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border border-outline-variant/30 inline-block" style={{ backgroundColor: item.attributes.primary_color }} />
                    <span className="font-medium text-on-surface">{item.attributes.primary_color}</span>
                    {item.attributes.secondary_color && (
                      <>
                        <span className="text-on-surface-variant">/</span>
                        <span className="w-4 h-4 rounded-full border border-outline-variant/30 inline-block" style={{ backgroundColor: item.attributes.secondary_color }} />
                        <span className="font-medium text-on-surface">{item.attributes.secondary_color}</span>
                      </>
                    )}
                  </div>
                </div>
                {item.attributes.features.length > 0 && (
                  <div className="bg-surface-container-low rounded-lg px-3 py-2 col-span-2">
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-1">特徵</div>
                    <div className="flex flex-wrap gap-1">
                      {item.attributes.features.map((f) => (
                        <span key={f} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-full">
                          {{ police_light: '警燈', ladder: '梯子', wing: '翅膀', blade: '刀片', crane: '吊臂', antenna: '天線', decal: '貼紙', open_top: '開頂', tank: '油罐', trailer: '拖車' }[f] ?? f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
```

- [ ] **Step 2: Build and test**

Run: `pnpm build && npx vitest run`
Expected: Build succeeds, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/CarDetailModal.tsx
git commit -m "feat: Show vehicle attributes in detail modal"
```

---

### Task 8: Deploy and verify

**Files:** No new files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Push to GitHub**

```bash
git push
```

- [ ] **Step 3: Deploy to Cloudflare Pages**

```bash
npx wrangler pages deploy dist --project-name tomica-collect --commit-dirty=true --commit-message="feat: vehicle attributes system"
```

- [ ] **Step 4: Verify on live site**

Open https://tomica-collect.pages.dev/catalog and verify:
- Vehicle type filter chips appear
- Color dot filter chips appear
- Clicking a car shows attributes in the modal
- Filters narrow results correctly

# Vehicle Attributes Enrichment System

## Goal

Enrich every catalog item (~2,118 models) with structured visual/physical attributes using AI batch analysis. These attributes serve two purposes:
1. **Faster AI recognition** — pre-filter candidates by attributes before scoring
2. **Better catalog browsing** — users can filter by color, vehicle type, features

## Attribute Schema (12 fields)

```typescript
interface VehicleAttributes {
  vehicle_category: 'car' | 'truck' | 'bus' | 'emergency' | 'construction' | 'motorcycle' | 'aircraft' | 'boat' | 'train' | 'fantasy'
  body_style: 'sedan' | 'suv' | 'coupe' | 'wagon' | 'van' | 'pickup' | 'convertible' | 'hatchback' | 'cab_over' | 'special'
  primary_color: string        // "red", "blue", "white", "silver", etc.
  secondary_color: string|null // for two-tone vehicles
  wheel_count: 2 | 4 | 6 | 8 | 0  // 0 for boats/aircraft
  size_class: 'small' | 'medium' | 'large' | 'extra_large'
  features: string[]           // ["police_light", "ladder", "wing", "blade", "crane", "antenna", "decal", "open_top"]
  era_style: 'classic' | 'modern' | 'futuristic' | 'retro'
  has_livery: boolean          // printed livery (police stripes, company logos, etc.)
  window_style: 'standard' | 'none' | 'panoramic' | 'cab'
}
```

## Data Storage

Add `attributes JSONB DEFAULT NULL` column to `tomica_catalog`. Add GIN index for JSONB queries:
```sql
ALTER TABLE tomica_catalog ADD COLUMN attributes JSONB;
CREATE INDEX idx_catalog_attributes ON tomica_catalog USING GIN (attributes);
```

Use a dedicated column (not `metadata`) because attributes have defined schema and are queried by the recognition pipeline and UI filters.

## Batch Attribute Extraction Pipeline

### Tool
New scraper CLI command: `uv run scrape enrich-attributes`

### Provider
Gemini Flash (`gemini-2.5-flash`) — cheapest vision model, sufficient for structured attribute extraction. Estimated cost: $0.5-1 for ~2,000 images.

### Flow
1. Query DB for items WHERE `image_url IS NOT NULL AND attributes IS NULL`
2. For each item, send image to Gemini Flash with structured prompt requesting the 12 attribute fields as JSON
3. Validate response against schema (reject malformed)
4. Write validated attributes to DB
5. Incremental: re-running skips already-enriched items
6. Report: `N enriched, M failed (no image), K skipped (already done)`

### Prompt Design
```
Analyze this Tomica die-cast miniature car product image.
Return a JSON object with exactly these fields:
{
  "vehicle_category": one of [car, truck, bus, emergency, construction, motorcycle, aircraft, boat, train, fantasy],
  "body_style": one of [sedan, suv, coupe, wagon, van, pickup, convertible, hatchback, cab_over, special],
  "primary_color": lowercase color name (e.g., "red", "blue", "white"),
  "secondary_color": second color if two-tone, or null,
  "wheel_count": number of visible wheels (2, 4, 6, 8, or 0 for boats/aircraft),
  "size_class": one of [small, medium, large, extra_large] relative to standard car,
  "features": array of applicable features from [police_light, ladder, wing, blade, crane, antenna, decal, open_top, tank, trailer],
  "era_style": one of [classic, modern, futuristic, retro],
  "has_livery": true if has printed livery/stripes/logos, false otherwise,
  "window_style": one of [standard, none, panoramic, cab]
}
Return ONLY the JSON, no explanation.
```

### Concurrency
- Semaphore(10) with 0.1s delay between requests
- Retry failed requests once with exponential backoff
- API key from environment variable `GEMINI_API_KEY`

## Recognition Pipeline Enhancement

### Current Flow (3 stages)
1. Scene classification → input type (box/loose/chassis)
2. Feature extraction → model_number, car_name, colors, manufacturer
3. matchCandidates() → brute-force score against entire catalog (2,118 items)

### New Flow (3a + 3b)

**Stage 3a: Pre-filter**
```
extracted_features = { vehicle_category: "emergency", primary_color: "white", ... }

candidates = DB.query(
  WHERE attributes->>'vehicle_category' = extracted.vehicle_category
  AND (attributes->>'primary_color' = extracted.primary_color 
       OR attributes->>'secondary_color' = extracted.primary_color)
)
```
Reduces search space from ~2,000 to ~20-80 items.

**Stage 3b: Enhanced weighted scoring**
Run matchCandidates on the pre-filtered set with expanded scoring:

| Factor | Current Weight | New Weight |
|--------|---------------|------------|
| model_number exact | 0.99 | 0.99 (unchanged) |
| car_name match | 0.35 | 0.30 |
| manufacturer match | 0.25 | 0.20 |
| body_color match | 0.20 | — (replaced by below) |
| vehicle_type match | 0.15 | — (replaced by below) |
| primary_color match | — | 0.15 |
| vehicle_category match | — | 0.10 |
| body_style match | — | 0.08 |
| features overlap | — | 0.10 |
| size_class match | — | 0.05 |
| era_style match | — | 0.02 |

**Fallback**: If pre-filter returns < 5 items, fall back to full catalog scan with enhanced scoring.

## Frontend Filter Enhancement

### New Catalog Filters

Add to the existing filter chip row:

1. **Vehicle Type** — horizontal chips (multi-select):
   `轎車 | SUV | 跑車 | 卡車 | 巴士 | 工程車 | 緊急車輛 | 其他`

2. **Color** — color dot chips (multi-select):
   `紅 | 藍 | 白 | 黑 | 銀 | 黃 | 綠 | 橙`

3. **Features** — toggle chips:
   `警燈 | 印刷塗裝`

### Query Implementation
Use Supabase JSONB operators:
```typescript
query = query.eq('attributes->vehicle_category', 'emergency')
query = query.in('attributes->primary_color', ['red', 'blue'])
query = query.contains('attributes->features', '["police_light"]')
```

### Detail Modal
Show attributes in the detail grid:
- Vehicle type + body style
- Color swatch (CSS circle with actual color)
- Feature tags as small badges

## Scope & Constraints

- Only items with `image_url` get AI-analyzed; items without images get `attributes = NULL`
- Attribute extraction is a one-time batch job + incremental for new items
- BYOK: batch enrichment uses server-side Gemini key (not user's key)
- No user editing of attributes in v1 (auto-generated only)
- Frontend filters gracefully handle NULL attributes (items without attributes still appear in "all" view)

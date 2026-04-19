# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Shared Libraries

### types.ts
- `CatalogItem`: 17 fields including `attributes: VehicleAttributes | null`
- `VehicleAttributes`: 12 fields (vehicle_category, body_style, primary_color, secondary_color, wheel_count, size_class, features[], era_style, has_livery, window_style)
- `getItemCode()`: Generates unique display code — "No.1-7" (regular+variant), "LV-86h" (TLV), "TP.08" (Premium)
- Series type: `'regular' | 'premium' | 'premium_unlimited' | 'limited_vintage' | 'dream'`

### search.ts
- Client-side search with multilingual synonym expansion
- `buildSearchIndex()`: tokenizes car_name + manufacturer + attributes into searchable text
- Synonym groups cover: colors (red/赤/紅), categories (emergency/緊急/パトカー), brands, features
- Used by `useCatalog` hook — no DB-level text search

### translate.ts
- `translateCarName(jpName, manufacturer)` → `{ displayName, manufacturer, vehicleType }`
- 40+ JP manufacturer names → English, 50+ model names, 30+ vehicle types → Chinese

### supabase.ts
- Singleton client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from env

### image.ts
- `compressImage(file)` → compressed Blob via `browser-image-compression`

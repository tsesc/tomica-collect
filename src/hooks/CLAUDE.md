# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Hooks

Custom React hooks encapsulating business logic. All depend on `lib/supabase.ts`.

### useCatalog
- Filters: series, numberRange, source, year, search, vehicleCategory, primaryColors, features
- JSONB attribute queries: `eq('attributes->>vehicle_category', ...)`, `in('attributes->>primary_color', [...])`
- Client-side numeric sorting (extracts number from model_number for correct No.1 < No.10 ordering)
- Search uses `lib/search.ts` client-side index, not DB `ilike`

### useCollection
- CRUD on `user_collection` table via Supabase client
- `collectedIds` is a `Set<string>` of catalog_id for O(1) lookup
- `fetchCollection` re-fetches after every mutation

### useAuth
- Wraps Supabase Auth (signUp, signIn, signOut, user, loading)
- `onAuthStateChange` listener for session persistence

### useRecognition
- Calls `/api/identify` with image_base64 + ai_provider
- **Gotcha**: Result stored in hook state — lost on page navigation. ScanResultPage needs the result from HomePage.

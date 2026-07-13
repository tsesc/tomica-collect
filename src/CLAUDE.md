# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Frontend (src/)

React 19 SPA with Vite, Tailwind CSS v4, React Router 7.

### Routing (App.tsx)
- `/catalog` — public, no auth required
- `/`, `/scan-result`, `/collection`, `/settings` — wrapped in `<ProtectedRoute>`
- `/auth` — login/signup page
- `/collection` is the showcase page ("收納盒") — drag-to-reorder + resizable tiles + case materials; see `components/showcase/` and `hooks/useCollectionLayout.ts`

### Design System ("Diecast Heritage")
Tokens in `index.css` via `@theme`:
- Primary: `#af101a` / Container: `#D32F2F`
- Fonts: Manrope (display), Inter (body), Material Symbols (icons)
- Surface colors: warm cream/rose tones

### Key Conventions
- All components are function components with TypeScript
- Hooks encapsulate all Supabase/API calls — pages never call Supabase directly
- `useCatalog` does client-side sorting (numeric model_number extraction) since Supabase doesn't sort "No.1" vs "No.10" correctly
- Search is fully client-side via `lib/search.ts` with multilingual synonym expansion (JA/EN/ZH-TW/ZH-CN)
- Image compression happens client-side before upload via `lib/image.ts`

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Cloudflare Pages Functions

Serverless API endpoints deployed alongside the SPA on Cloudflare Pages.

### Security
- All endpoints verify JWT from `Authorization: Bearer <token>` header
- Extract `user.id` from verified token — never trust client-provided user_id
- Uses `SUPABASE_SERVICE_ROLE_KEY` env for server-side DB access (bypasses RLS)

### identify.ts — 3-Stage AI Recognition Pipeline
1. **Scene classification**: Chinese prompt → `{ type: 1-5, confidence: 0-1 }` (box front/back/loose/chassis/other)
2. **Feature extraction**: BOX_PROMPT (model_number, car_name, series) or LOOSE_PROMPT (vehicle_type, body_color, manufacturer, markings, chassis_text)
3. **Candidate matching**: `matchCandidates(features, catalog)` — exact model_number → 0.99, otherwise 10+ dimension weighted scoring with attribute-aware bonuses

**Providers**: OpenAI (gpt-4o), Gemini (gemini-2.5-flash), Claude (claude-sonnet-4-6) — each uses different API format.

**`matchCandidates` is exported** for unit testing in `tests/api/identify.test.ts`.

### settings.ts — BYOK Key Management
- Upsert API keys to `user_settings` table
- Note: SettingsPage currently bypasses this endpoint and writes directly to DB

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## GitHub Actions CI/CD

### workflows/ci.yml
- Triggers: push/PR to `main`
- Steps: pnpm install → TypeScript compile → Vite build → Vitest run

### workflows/deploy.yml
- Triggers: push to `main`
- Steps: build with env vars → `wrangler pages deploy`
- Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Manual Deploy (faster)
```bash
pnpm build && npx wrangler pages deploy dist --project-name tomica-collect --commit-dirty=true --commit-message="deploy"
```

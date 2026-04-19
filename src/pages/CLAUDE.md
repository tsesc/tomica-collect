# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Pages

Route-based page components. Each page uses hooks for data — never calls Supabase directly.

### CatalogPage (most complex)
- Series tabs: 常規 / TLV / Premium / Unlimited / Dream
- Number range tabs (regular only): 全部 / 1-30 / 31-60 / ...
- Filter chips: year dropdown, source (現行/歷代), collection (已收藏/未收藏), vehicle category, color dots
- Attribute filters use JSONB queries via `useCatalog` hook
- 50-item client-side pagination
- Opens `CarDetailModal` on card click

### CollectionPage
- Tabs: 已收藏 / 缺少清單
- Uses `useCollection` for CRUD

### HomePage
- Dashboard + camera input for AI scanning
- Recognition result stored in `useRecognition` hook state

### ScanResultPage
- Displays top 5 AI candidates with confidence scores
- **Gotcha**: needs recognition result from HomePage — state lost on direct navigation

### AuthPage
- Supabase email/password auth

### SettingsPage
- BYOK API key management
- Currently writes directly to `user_settings` table (not via `/api/settings` endpoint)

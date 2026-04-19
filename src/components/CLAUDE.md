# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Components

Shared React UI components used across pages.

### Key Components
- **CarDetailModal**: Full detail view with color swatches (`colorToZh`/`colorToHex` maps), attribute badges, collection toggle. Closes on Escape/backdrop. Prevents body scroll.
- **CatalogCard**: Grid card showing `getItemCode()`, translated name, release year range, collection badge. Uses `translateCarName()` from `lib/translate.ts`.
- **Layout**: Wraps all routes. TopNav (desktop) + BottomNav (mobile) with `pb-16 md:pb-0` for bottom nav clearance.
- **FilterSidebar**: Legacy desktop sidebar (mostly replaced by inline chips in CatalogPage).
- **PhotoCapture**: Camera/file input for AI scanning.

### Patterns
- Color display uses `COLOR_ZH` and `COLOR_HEX` lookup tables in CarDetailModal for Japanese→Chinese color names
- `getItemCode()` from `lib/types.ts` generates unique display codes (e.g., "No.1-7", "LV-86h")
- `line-clamp-2` for card text truncation, `scrollbar-hide` CSS class for horizontal scroll areas

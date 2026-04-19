# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this directory.

## Python Scraper

Multi-source Tomica data scraper + attribute enrichment pipeline. Python 3.12 with `uv`.

### Setup
```bash
cd scraper
uv sync                           # Install dependencies
uv run scrape                     # Run default (regular series)
```

### Dependencies
- `httpx` — async HTTP client for all scraping
- `beautifulsoup4` + `lxml` — HTML parsing
- `pillow` — image color extraction (no AI)
- `playwright` — headless browser for JS-heavy sites

### CLI Commands (`uv run scrape <command>`)
| Command | Source | Items | Method |
|---------|--------|-------|--------|
| *(default)* | takaratomy.co.jp | 150 | async, 8 pages concurrent |
| `history` | cochume.com | 1028 | async, semaphore(10), 0.3s delay |
| `tlv` | minicar.tomytec.co.jp | 1335 | **POST** API (GET returns same page!) |
| `dream` | takaratomy.co.jp | 27 | single page |
| `premium` | takaratomy.co.jp | 5 | single page |
| `unlimited` | takaratomy.co.jp | 12 | single page |
| `funbox` | shop.funbox.com.tw | ~178 | JSON API with pagination |
| `classify` | rule-based | all | regex on car_name → attributes |
| `extract-colors` | Pillow | all w/ images | pixel analysis, center 60% crop |
| `enrich-attributes` | Gemini Flash | all w/ images | AI vision, needs GEMINI_API_KEY |
| `dedup` | cross-source | - | report duplicates across sources |

### Attribute Enrichment Pipeline (3 layers)
1. **classify.py** — instant, zero cost: regex on Japanese car_name → vehicle_category, body_style, features, era_style
2. **color_extract.py** — fast, zero cost: Pillow downloads image, crops center 60%, quantizes colors, maps RGB→named colors. Demotes neutral grays.
3. **enrich.py** — slow, costs $: Gemini Flash Vision API for highest accuracy. Rate limited (15 RPM free tier).

### URL Quirks
- No.21: typo URL `tiomica-no-21` (cochume.com)
- No.141-150: `longtomica-no-XXX` prefix (cochume.com)
- TLV API: must use **POST** not GET (GET returns same 15 items every page)

### Data Output
- `data/*.json` — scraped raw data (gitignored)
- `data/backup/` — timestamped backups before overwrite
- `data/*.sql` — generated UPDATE/INSERT statements for Supabase
- CLI auto-diffs against previous backup and warns about lost items

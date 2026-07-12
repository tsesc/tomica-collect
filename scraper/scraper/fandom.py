"""Scrape Tomica data from tomica.fandom.com via MediaWiki API."""

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx

API_BASE = "https://tomica.fandom.com/api.php"
REQUEST_DELAY = 0.3  # polite delay between paginated API calls
SYNC_STATE_FILE = Path(__file__).parent.parent / "data" / "fandom_sync_state.json"

# (category, series_value, priority)  — higher priority number wins in dedup
CATEGORIES = [
    ("Tomica Limited Vintage", "limited_vintage", 90),
    ("Tomica Limited Vintage Neo", "limited_vintage", 90),
    ("Tomica Limited", "limited_vintage", 85),
    ("Disney Tomica", "disney", 80),
    ("Dream Tomica", "dream", 75),
    ("Tomica Premium", "premium", 70),
    ("Tomica Premium Unlimited", "unlimited", 70),
    ("Cars Tomica", "cars", 65),
    ("Gift Sets", "giftset", 60),
    ("Tomica Town", "town", 55),
    # Year categories — regular / misc; lowest priority (catch-all)
    *[(f"{y} Tomica", "fandom", 10) for y in range(1970, 2026)],
    ("Classic Tomica", "fandom", 10),
]


async def _get_category_members(client: httpx.AsyncClient, category: str) -> list[str]:
    """Return all page titles (not subcats) in a MediaWiki category."""
    titles: list[str] = []
    cont = None
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{category}",
            "cmlimit": "500",
            "cmtype": "page",
            "format": "json",
        }
        if cont:
            params["cmcontinue"] = cont
        resp = await client.get(API_BASE, params=params, timeout=30)
        data = resp.json()
        members = data.get("query", {}).get("categorymembers", [])
        titles.extend(m["title"] for m in members)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont:
            break
    return titles


async def _get_page_images(client: httpx.AsyncClient, titles: list[str]) -> dict[str, str | None]:
    """Batch-fetch thumbnail URLs for a list of page titles (20 per API call)."""
    images: dict[str, str | None] = {}
    # Use smaller batches (20) and skip titles containing '|' which break the API
    safe_titles = [t for t in titles if "|" not in t]
    batch_size = 20
    for i in range(0, len(safe_titles), batch_size):
        batch = safe_titles[i : i + batch_size]
        params = {
            "action": "query",
            "prop": "pageimages",
            "pithumbsize": "400",
            "titles": "|".join(batch),
            "format": "json",
        }
        for attempt in range(3):
            try:
                resp = await client.get(API_BASE, params=params, timeout=30)
                if resp.status_code == 200 and resp.text:
                    data = resp.json()
                    for page in data.get("query", {}).get("pages", {}).values():
                        title = page.get("title", "")
                        thumb = page.get("thumbnail", {})
                        images[title] = thumb.get("source")
                    break
                await asyncio.sleep(1)
            except Exception:
                await asyncio.sleep(2)
        else:
            pass  # skip this batch on persistent failure
    return images


def _parse_model(title: str) -> tuple[str, str]:
    """Return (model_number, car_name) from a wiki page title.

    Handles patterns like:
      "No. 1 Bluebird SSS Coupe"     → ("No.1",        "Bluebird SSS Coupe")
      "TLV 1966 Toyota Corolla KE10" → ("TLV",         "1966 Toyota Corolla KE10")
      "C-01 Lightning McQueen"       → ("C-01",        "Lightning McQueen")
      "TP-01 Nissan GT-R"            → ("TP-01",       "Nissan GT-R")
      "2020 Shareholders Set"        → ("FD:2020 S…",  "2020 Shareholders Set")

    For items without a standard model number, uses "FD:" + title[:60] as
    model_number to satisfy the DB unique constraint.
    """
    # "No. X" or "No.X" prefix
    m = re.match(r"No\.\s*(\d+)\s+(.+)", title)
    if m:
        return f"No.{m.group(1)}", m.group(2).strip()

    # TLV with numeric code: "TLV-01", "TLV-N01", "TLV-NEO01"
    m = re.match(r"(TLV[-]?(?:NEO|N)?[\d]+[A-Z]*)\s+(.+)", title, re.IGNORECASE)
    if m:
        return m.group(1).upper(), m.group(2).strip()

    # Cars Tomica: "C-01 ..."
    m = re.match(r"(C-\d+\w*)\s+(.+)", title, re.IGNORECASE)
    if m:
        return m.group(1), m.group(2).strip()

    # Tomica Premium: "TP-XX", "TPR-XX"
    m = re.match(r"(TP[R]?[-]?\d+\w*)\s+(.+)", title, re.IGNORECASE)
    if m:
        return m.group(1).upper(), m.group(2).strip()

    # Tomica Premium Unlimited: "TPU-XX"
    m = re.match(r"(TPU[-]?\d+\w*)\s+(.+)", title, re.IGNORECASE)
    if m:
        return m.group(1).upper(), m.group(2).strip()

    # No standard prefix → use "FD:" + truncated title as model_number
    # This ensures the unique constraint (model_number, variant, series, …) is satisfied.
    return f"FD:{title[:60]}", title


async def scrape_fandom(fetch_images: bool = False) -> list[dict]:
    """Scrape all Tomica data from tomica.fandom.com.

    Returns a deduplicated list of dicts, one per wiki page,
    with the highest-priority series label when a page appears
    in multiple categories.

    Args:
        fetch_images: If True, also batch-fetch thumbnail URLs (slow).
    """
    # title → (series, priority)
    seen: dict[str, tuple[str, int]] = {}

    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        for category, series, priority in CATEGORIES:
            titles = await _get_category_members(client, category)
            if not titles:
                continue
            print(f"  [{series:20s}] {category}: {len(titles)} pages")
            for title in titles:
                existing = seen.get(title)
                if existing is None or priority > existing[1]:
                    seen[title] = (series, priority)

        images: dict[str, str | None] = {}
        if fetch_images:
            all_titles = list(seen.keys())
            print(f"\n  Fetching images for {len(all_titles)} unique pages...")
            for i in range(0, len(all_titles), 20):
                batch = all_titles[i : i + 20]
                chunk = await _get_page_images(client, batch)
                images.update(chunk)
                if i % 500 == 0 and i > 0:
                    print(f"    images {i}/{len(all_titles)}...")

    # Build final item list
    items: list[dict] = []
    for title, (series, _) in seen.items():
        model_number, car_name = _parse_model(title)
        items.append(
            {
                "model_number": model_number,
                "car_name": car_name,
                "car_name_en": None,
                "series": series,
                "is_first_edition": False,
                "manufacturer": None,
                "vehicle_type": None,
                "body_color": [],
                "release_date": None,
                "retired": False,
                "image_url": images.get(title),
                "source": "fandom",
                "metadata": {"wiki_title": title},
            }
        )

    return items


def fetch_fandom_images(service_role_key: str, supabase_url: str, batch_size: int = 500) -> dict:
    """Fetch thumbnail images for fandom records in Supabase that have no image_url.

    Queries the DB for fandom records with null image_url, reads wiki_title from
    metadata, batch-fetches thumbnails from the Fandom MediaWiki API, then PATCHes
    image_url back into Supabase.

    Returns: {"updated": int, "not_found": int, "failed": int}
    """
    import json as _json

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    base_url = f"{supabase_url}/rest/v1/tomica_catalog"

    # 1. Fetch all fandom rows missing image_url (paginated)
    rows: list[dict] = []
    offset = 0
    with httpx.Client(timeout=60) as client:
        while True:
            resp = client.get(
                f"{base_url}?source=eq.fandom&image_url=is.null"
                f"&select=id,metadata&limit=1000&offset={offset}",
                headers=headers,
            )
            batch = resp.json()
            if not batch:
                break
            rows.extend(batch)
            offset += len(batch)
            if len(batch) < 1000:
                break

    print(f"  Found {len(rows)} fandom records without images")
    if not rows:
        return {"updated": 0, "not_found": 0, "failed": 0}

    # Map wiki_title → row id
    title_to_ids: dict[str, list[str]] = {}
    for row in rows:
        meta = row.get("metadata") or {}
        title = meta.get("wiki_title", "")
        if title:
            title_to_ids.setdefault(title, []).append(row["id"])

    titles = list(title_to_ids.keys())
    print(f"  Fetching images for {len(titles)} unique wiki titles...")

    # 2. Batch-fetch images from Fandom API (async)
    async def _fetch_all() -> dict[str, str | None]:
        imgs: dict[str, str | None] = {}
        async with httpx.AsyncClient(
            headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
            follow_redirects=True,
        ) as ac:
            for i in range(0, len(titles), 20):
                batch = titles[i : i + 20]
                chunk = await _get_page_images(ac, batch)
                imgs.update(chunk)
                if i % 500 == 0 and i > 0:
                    print(f"    images {i}/{len(titles)}...")
        return imgs

    images = asyncio.run(_fetch_all())
    found = sum(1 for v in images.values() if v)
    print(f"  Got images for {found}/{len(titles)} titles")

    # 3. PATCH image_url back into Supabase
    updated = not_found = failed = 0
    patch_headers = {**headers, "Prefer": "return=minimal"}

    with httpx.Client(timeout=30) as client:
        for title, img_url in images.items():
            ids = title_to_ids.get(title, [])
            for row_id in ids:
                if not img_url:
                    not_found += 1
                    continue
                resp = client.patch(
                    f"{base_url}?id=eq.{row_id}",
                    headers=patch_headers,
                    json={"image_url": img_url},
                )
                if resp.status_code < 300:
                    updated += 1
                else:
                    print(f"  PATCH failed {row_id}: {resp.status_code}")
                    failed += 1

    return {"updated": updated, "not_found": not_found, "failed": failed}


def import_to_supabase(items: list[dict], service_role_key: str, supabase_url: str) -> dict:
    """Insert fandom items into Supabase tomica_catalog via REST API.

    Uses upsert=false (INSERT … ON CONFLICT DO NOTHING equivalent via
    the Prefer: resolution=ignore-duplicates header).
    """
    import json as _json

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        # return=representation so we can count what ACTUALLY landed —
        # ignore-duplicates silently skips rows that hit any unique index
        # (idx_catalog_unique), and return=minimal hid that as a fake success.
        "Prefer": "return=representation,resolution=ignore-duplicates",
    }
    base_url = f"{supabase_url}/rest/v1/tomica_catalog?select=id"

    inserted = 0
    failed = 0
    BATCH = 200

    with httpx.Client(timeout=60) as client:
        for i in range(0, len(items), BATCH):
            batch = items[i : i + BATCH]
            # Normalize body_color to postgres array literal
            payload = []
            for item in batch:
                row = dict(item)
                row["body_color"] = row.get("body_color") or []
                row["metadata"] = row.get("metadata") or {}
                payload.append(row)

            resp = client.post(base_url, headers=headers, json=payload)
            if resp.status_code in (200, 201):
                landed = len(resp.json())
                inserted += landed
                if landed < len(batch):
                    print(f"  Batch {i}–{i+len(batch)}: {len(batch) - landed} duplicates ignored")
            else:
                print(f"  Batch {i}–{i+len(batch)} failed: {resp.status_code} {resp.text[:200]}")
                failed += len(batch)

            if i % 1000 == 0:
                print(f"    {i}/{len(items)} rows processed...")

    return {"inserted": inserted, "failed": failed}


# ---------------------------------------------------------------------------
# Incremental sync via MediaWiki RecentChanges
# ---------------------------------------------------------------------------

# category name → (series, priority), built from the full-scrape CATEGORIES list
_CATEGORY_SERIES = {category: (series, priority) for category, series, priority in CATEGORIES}


class SyncStateMissing(Exception):
    """Raised when incremental sync is requested but no state file exists."""


def load_sync_state(path: Path = SYNC_STATE_FILE) -> str | None:
    """Return last_sync timestamp from the state file, or None if uninitialized."""
    path = Path(path)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except (ValueError, OSError):
        return None
    return data.get("last_sync") or None


def save_sync_state(last_sync: str, path: Path = SYNC_STATE_FILE) -> None:
    """Write last_sync timestamp (UTC ISO8601) to the state file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"last_sync": last_sync}, indent=2) + "\n")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _get_recent_changes(client: httpx.AsyncClient, rcend: str) -> list[str]:
    """Return unique page titles changed since `rcend` (new + edit, ns=0).

    Paginates with rccontinue. rcend is the *older* boundary (API lists
    newest-first by default).
    """
    titles: list[str] = []
    seen: set[str] = set()
    cont = None
    while True:
        params = {
            "action": "query",
            "list": "recentchanges",
            "rcprop": "title|ids|timestamp",
            "rcnamespace": "0",
            "rctype": "new|edit",
            "rclimit": "500",
            "rcend": rcend,
            "format": "json",
        }
        if cont:
            params["rccontinue"] = cont
        resp = await client.get(API_BASE, params=params, timeout=30)
        data = resp.json()
        for change in data.get("query", {}).get("recentchanges", []):
            title = change.get("title", "")
            if title and title not in seen:
                seen.add(title)
                titles.append(title)
        cont = data.get("continue", {}).get("rccontinue")
        if not cont:
            break
        await asyncio.sleep(REQUEST_DELAY)
    return titles


async def _get_page_categories(client: httpx.AsyncClient, titles: list[str]) -> dict[str, list[str]]:
    """Batch-fetch categories for page titles (20 per API call)."""
    categories: dict[str, list[str]] = {}
    safe_titles = [t for t in titles if "|" not in t]
    batch_size = 20
    for i in range(0, len(safe_titles), batch_size):
        batch = safe_titles[i : i + batch_size]
        params = {
            "action": "query",
            "prop": "categories",
            "cllimit": "500",
            "titles": "|".join(batch),
            "format": "json",
        }
        resp = await client.get(API_BASE, params=params, timeout=30)
        data = resp.json()
        for page in data.get("query", {}).get("pages", {}).values():
            title = page.get("title", "")
            cats = [
                c.get("title", "").removeprefix("Category:")
                for c in page.get("categories", [])
            ]
            categories[title] = cats
        if i + batch_size < len(safe_titles):
            await asyncio.sleep(REQUEST_DELAY)
    return categories


def _resolve_series(categories: list[str]) -> str:
    """Map a page's categories to a series label (highest priority wins)."""
    best: tuple[str, int] | None = None
    for cat in categories:
        entry = _CATEGORY_SERIES.get(cat)
        if entry and (best is None or entry[1] > best[1]):
            best = entry
    # Unknown categories (e.g. a new "2026 Tomica" year category) → catch-all
    return best[0] if best else "fandom"


async def sync_incremental(
    state_path: Path = SYNC_STATE_FILE,
    fetch_images: bool = True,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Fetch pages changed since last sync and rebuild their catalog items.

    Returns {"items": [...], "changed_pages": int, "last_sync": str, "new_sync": str}.
    Does NOT write the state file — callers save `new_sync` after a successful upsert.

    Raises SyncStateMissing if the state file is absent/uninitialized (first run
    must use the full `scrape fandom` mode instead of silently scraping everything).
    """
    last_sync = load_sync_state(state_path)
    if not last_sync:
        raise SyncStateMissing(
            f"No sync state at {state_path} — run a full 'scrape fandom' first, "
            "then initialize the state file."
        )

    new_sync = _utcnow_iso()
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(
            headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
            follow_redirects=True,
        )
    try:
        titles = await _get_recent_changes(client, rcend=last_sync)
        print(f"  {len(titles)} pages changed since {last_sync}")

        categories: dict[str, list[str]] = {}
        images: dict[str, str | None] = {}
        if titles:
            categories = await _get_page_categories(client, titles)
            if fetch_images:
                images = await _get_page_images(client, titles)
    finally:
        if own_client:
            await client.aclose()

    items: list[dict] = []
    for title in titles:
        series = _resolve_series(categories.get(title, []))
        model_number, car_name = _parse_model(title)
        items.append(
            {
                "model_number": model_number,
                "car_name": car_name,
                "car_name_en": None,
                "series": series,
                "is_first_edition": False,
                "manufacturer": None,
                "vehicle_type": None,
                "body_color": [],
                "release_date": None,
                "retired": False,
                "image_url": images.get(title),
                "source": "fandom",
                "metadata": {"wiki_title": title},
            }
        )

    return {
        "items": items,
        "changed_pages": len(titles),
        "last_sync": last_sync,
        "new_sync": new_sync,
    }


def fandom_sync(
    service_role_key: str,
    supabase_url: str,
    state_path: Path = SYNC_STATE_FILE,
    fetch_images: bool = True,
) -> dict:
    """One-call incremental sync: fetch changed pages, upsert, update state.

    State file is only advanced when the Supabase import has no failures,
    so a failed run is retried from the same last_sync next time.
    """
    result = asyncio.run(sync_incremental(state_path, fetch_images=fetch_images))
    items = result["items"]
    summary = {
        "changed_pages": result["changed_pages"],
        "inserted": 0,
        "failed": 0,
        "state_updated": False,
    }

    if items:
        import_result = import_to_supabase(items, service_role_key, supabase_url)
        summary["inserted"] = import_result["inserted"]
        summary["failed"] = import_result["failed"]

    if summary["failed"] == 0:
        save_sync_state(result["new_sync"], state_path)
        summary["state_updated"] = True

    return summary

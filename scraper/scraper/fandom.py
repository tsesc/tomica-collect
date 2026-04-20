"""Scrape Tomica data from tomica.fandom.com via MediaWiki API."""

import asyncio
import re
import httpx

API_BASE = "https://tomica.fandom.com/api.php"

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
        "Prefer": "return=minimal,resolution=ignore-duplicates",
    }
    base_url = f"{supabase_url}/rest/v1/tomica_catalog"

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
                inserted += len(batch)
            elif resp.status_code == 409:
                # Partial conflict — still ok for ignored dupes
                inserted += len(batch)
            else:
                print(f"  Batch {i}–{i+len(batch)} failed: {resp.status_code} {resp.text[:200]}")
                failed += len(batch)

            if i % 1000 == 0:
                print(f"    {i}/{len(items)} rows processed...")

    return {"inserted": inserted, "failed": failed}

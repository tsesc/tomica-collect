"""Detect new Tomica releases by diffing the 5 official scrapers against Supabase."""

import asyncio
import logging

import httpx

from .tomica import scrape_regular_series
from .tlv import scrape_tlv_series
from .dream import scrape_dream_series
from .premium import scrape_premium_series
from .unlimited import scrape_unlimited_series

logger = logging.getLogger(__name__)


def diff_new_items(
    scraped: list[dict],
    existing: set[tuple[str, str]],
) -> list[dict]:
    """Return items whose (series, model_number) is not in the existing set."""
    return [
        item
        for item in scraped
        if (item.get("series"), item.get("model_number")) not in existing
    ]


async def _fetch_existing(
    client: httpx.AsyncClient,
    supabase_url: str,
    supabase_key: str,
) -> set[tuple[str, str]]:
    """Page through tomica_catalog official rows and collect (series, model_number)."""
    existing: set[tuple[str, str]] = set()
    offset = 0
    page_size = 1000
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}

    while True:
        url = (
            f"{supabase_url}/rest/v1/tomica_catalog"
            f"?select=series,model_number&source=eq.official"
            f"&offset={offset}&limit={page_size}"
        )
        resp = await client.get(url, headers=headers, timeout=30.0)
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        for row in rows:
            existing.add((row["series"], row["model_number"]))
        offset += len(rows)
        if len(rows) < page_size:
            break

    return existing


async def _safe_scrape(name: str, coro):
    """Run a scraper coroutine, swallow exceptions, return [] on failure."""
    try:
        return await coro
    except Exception as e:
        logger.warning("Scraper %s failed: %s", name, e)
        return []


async def detect_new_releases(
    supabase_url: str,
    supabase_key: str,
) -> list[dict]:
    """Run all 5 scrapers, diff against the DB, return new items."""
    async with httpx.AsyncClient() as client:
        existing = await _fetch_existing(client, supabase_url, supabase_key)

    scrape_results = await asyncio.gather(
        _safe_scrape("regular", scrape_regular_series()),
        _safe_scrape("tlv", scrape_tlv_series()),
        _safe_scrape("dream", scrape_dream_series()),
        _safe_scrape("premium", scrape_premium_series()),
        _safe_scrape("unlimited", scrape_unlimited_series()),
    )
    scraped: list[dict] = [item for sublist in scrape_results for item in sublist]

    logger.info("Scraped %d items total; %d existing in DB", len(scraped), len(existing))
    return diff_new_items(scraped, existing)

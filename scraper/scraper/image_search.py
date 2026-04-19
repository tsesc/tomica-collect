"""Find missing images for historical Tomica models via Google Images (Playwright)."""

import asyncio
import json
import logging
import re
import urllib.parse

logger = logging.getLogger(__name__)

# Domains that are reliable for Tomica product images
PREFERRED_DOMAINS = [
    "cochume.com", "amazon.co.jp", "m.media-amazon.com",
    "auctions.c.yimg.jp", "static.mercdn.net", "tshop.r10s.jp",
    "shop-pro.jp", "kaitoricollector.com", "kaitori-world.jp",
    "takaratomy.co.jp", "tomytec.co.jp",
]

BLOCKED_DOMAINS = [
    "google.com", "gstatic.com", "googleapis.com", "youtube.com",
    "facebook.com", "twitter.com", "instagram.com",
]


def _score_url(url: str) -> int:
    """Score an image URL by reliability. Higher = better."""
    score = 0
    lower = url.lower()
    for d in PREFERRED_DOMAINS:
        if d in lower:
            score += 10
            break
    for d in BLOCKED_DOMAINS:
        if d in lower:
            return -1
    # Prefer larger images
    if "orig" in lower or "1200" in lower or "1000" in lower:
        score += 3
    if "thumb" in lower or "small" in lower or "icon" in lower:
        score -= 3
    # Prefer jpg/webp
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        score += 1
    return score


def _extract_image_urls_from_html(html: str) -> list[str]:
    """Extract real image URLs from Google Images HTML/script data."""
    urls = re.findall(r'https?://[^\s"\'\\]+\.(?:jpg|jpeg|png|webp)', html, re.IGNORECASE)
    seen = set()
    result = []
    for url in urls:
        # Clean up escaped characters
        url = url.replace("\\u003d", "=").replace("\\u0026", "&")
        url = url.split("\\")[0]  # Remove any remaining escapes
        if url in seen:
            continue
        seen.add(url)
        score = _score_url(url)
        if score >= 0:
            result.append((score, url))
    result.sort(key=lambda x: -x[0])
    return [url for _, url in result]


async def search_one_image_playwright(
    page,
    model_number: str,
    variant: int | None,
    car_name: str,
    year: int | None = None,
    exclude_url: str | None = None,
) -> str | None:
    """Search Bing Images for a single Tomica model using Playwright page.

    Args:
        exclude_url: If set, skip this URL from results (used to avoid returning same duplicate).
    """
    query = f"トミカ {model_number}"
    if variant:
        query += f"-{variant}"
    query += f" {car_name}"
    if year:
        query += f" {year}年"
    query += " ミニカー"

    encoded = urllib.parse.quote(query)
    url = f"https://www.bing.com/images/search?q={encoded}"

    try:
        await page.goto(url, timeout=15000)
        await page.wait_for_timeout(1500)

        # Extract image URLs from Bing's data attributes
        urls = await page.evaluate('''() => {
            const results = [];
            document.querySelectorAll('a.iusc').forEach(a => {
                try {
                    const m = JSON.parse(a.getAttribute('m') || '{}');
                    if (m.murl) results.push(m.murl);
                } catch {}
            });
            return results;
        }''')

        if urls:
            # Score and pick best URL, optionally excluding a known duplicate
            scored = [(s, u) for u in urls if (s := _score_url_js(u)) >= 0 and u != exclude_url]
            scored.sort(key=lambda x: -x[0])
            if scored:
                return scored[0][1]
            # Fall back to any URL that isn't the excluded one
            filtered = [u for u in urls if u != exclude_url]
            return filtered[0] if filtered else None
        return None
    except Exception as e:
        logger.warning("Search failed for %s %s: %s", model_number, car_name, e)
        return None


def _score_url_js(url: str) -> int:
    """Score helper called from sync context."""
    return _score_url(url)


async def batch_search_images_playwright(
    items: list[dict],
    concurrency: int = 1,
) -> dict[str, str]:
    """Search for images using Playwright + Google Images.

    Must be run with playwright installed: pip install playwright && playwright install chromium
    """
    from playwright.async_api import async_playwright

    results: dict[str, str] = {}
    found = 0
    total = len(items)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            locale="ja-JP",
        )
        page = await context.new_page()

        for i, item in enumerate(items):
            item_id = item["id"]
            mn = item.get("model_number", "?")
            cn = item.get("car_name", "?")
            v = item.get("variant")

            img_url = await search_one_image_playwright(page, mn, v, cn)

            if img_url:
                results[item_id] = img_url
                found += 1
                print(f"  ✓ [{found}/{total}] {mn}-{v or '?'} {cn[:30]} → {img_url[:60]}")
            else:
                print(f"  ✗ [{i+1}/{total}] {mn}-{v or '?'} {cn[:30]}")

            # Rate limit Google
            await asyncio.sleep(3)

        await browser.close()

    return results


# Keep the Gemini-based search as fallback
async def batch_search_images(
    items: list[dict],
    api_key: str,
    concurrency: int = 5,
) -> dict[str, str]:
    """Search using Playwright (primary) with Gemini API key ignored for now."""
    return await batch_search_images_playwright(items, concurrency=1)

"""Scrape Dream Tomica lineup from takaratomy.co.jp."""

import httpx
from bs4 import BeautifulSoup
import re

URL = "https://www.takaratomy.co.jp/products/tomica/lineup/dream/"
IMAGE_BASE = "https://www.takaratomy.co.jp/products/tomica/lineup/dream/"


def parse_dream_page(soup: BeautifulSoup) -> list[dict]:
    """Parse Dream Tomica listing page.

    Structure: <h4>No.XXX 車名</h4> followed by <img> with product image.
    """
    items = []

    for h4 in soup.find_all("h4"):
        text = h4.get_text(strip=True)
        # Match "No.XXX 車名" pattern (Dream uses 3-digit numbers)
        match = re.match(r"(No\.\d+)\s+(.+)", text)
        if not match:
            continue

        model_number = match.group(1)
        car_name = match.group(2).strip()

        # Find the associated image — look for next img sibling or nearby
        image_url = None
        # Check siblings and parent for img
        for sibling in h4.find_all_next(limit=5):
            if sibling.name == "img" and sibling.get("src"):
                src = sibling["src"]
                if src.startswith("images/"):
                    src = IMAGE_BASE + src
                elif not src.startswith("http"):
                    src = IMAGE_BASE + src
                # Skip purchase buttons and logos
                if "btn_" in src or "logo" in src:
                    continue
                image_url = src
                break
            # Stop if we hit the next h4
            if sibling.name == "h4":
                break

        items.append({
            "model_number": model_number,
            "car_name": car_name,
            "car_name_en": None,
            "series": "dream",
            "is_first_edition": False,
            "manufacturer": None,
            "vehicle_type": None,
            "body_color": [],
            "release_date": None,
            "retired": False,
            "image_url": image_url,
            "source": "official",
            "metadata": {},
        })

    return items


async def scrape_dream_series() -> list[dict]:
    """Scrape Dream Tomica series."""
    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        resp = await client.get(URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        items = parse_dream_page(soup)
        print(f"  {URL} → {len(items)} Dream Tomica items")
        return items

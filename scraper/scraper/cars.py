"""Scrape Cars Tomica (Pixar) from takaratomy.co.jp."""

import httpx
from bs4 import BeautifulSoup
import re
import unicodedata

URL = "https://www.takaratomy.co.jp/products/disney/cars/"
IMAGE_BASE = "https://www.takaratomy.co.jp/products/disney/cars/"


def parse_cars_page(soup: BeautifulSoup) -> list[dict]:
    """Parse Cars Tomica listing page.

    Products use format: "C-XX キャラクター名（バリアントタイプ）"
    Found in h4, h3, or strong/b tags containing "C-" prefix.
    Also check img alt text.
    """
    items = []
    seen = set()

    # Try h4, h3, strong, b, and img alt for product names
    for el in soup.find_all(["h4", "h3", "strong", "b", "img"]):
        if el.name == "img":
            text = el.get("alt", "")
        else:
            text = el.get_text(strip=True)

        # Match "C-XX character name" (may use full-width space)
        text = unicodedata.normalize("NFKC", text)
        match = re.match(r"(C-\d+)\s+(.+)", text)
        if not match:
            continue

        model_number = match.group(1)
        car_name = match.group(2).strip()

        if model_number in seen:
            continue
        seen.add(model_number)

        # Find nearby image
        image_url = None
        if el.name == "img" and el.get("src"):
            src = el["src"]
            if not src.startswith("http"):
                src = IMAGE_BASE + src
            image_url = src
        else:
            # Look for next img sibling
            for sibling in el.find_all_next("img", limit=3):
                src = sibling.get("src", "")
                if src and "btn_" not in src and "logo" not in src:
                    if not src.startswith("http"):
                        src = IMAGE_BASE + src
                    image_url = src
                    break

        items.append({
            "model_number": model_number,
            "car_name": car_name,
            "car_name_en": None,
            "series": "cars",
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


async def scrape_cars_series() -> list[dict]:
    """Scrape Cars Tomica (Pixar) series."""
    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        resp = await client.get(URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        items = parse_cars_page(soup)
        print(f"  {URL} → {len(items)} Cars Tomica items")
        return items

"""Scrape Tomica Premium Unlimited from takaratomy.co.jp."""

import httpx
from bs4 import BeautifulSoup
import re
import unicodedata

URL = "https://www.takaratomy.co.jp/products/tomica/tomicabrand/unlimited/"
BASE = "https://www.takaratomy.co.jp/products/tomica/tomicabrand/unlimited/"


def _normalize(text: str) -> str:
    """Convert full-width characters to ASCII."""
    return unicodedata.normalize("NFKC", text)


def parse_unlimited_page(soup: BeautifulSoup) -> list[dict]:
    """Parse Premium Unlimited listing page.

    Entries in img alt text and link titles: "01 頭文字D AE86 トレノ（藤原拓海）"
    """
    items = []
    seen = set()

    for el in soup.find_all(["a", "img"]):
        text = el.get("alt") or el.get("title") or ""
        text = _normalize(text).strip()

        # Match "NN SeriesName CarName（CharacterName）"
        match = re.match(r"(\d{2})\s+(.+)", text)
        if not match:
            continue

        num = int(match.group(1))
        car_name = match.group(2).strip()
        model_number = f"PU.{num:02d}"

        if model_number in seen:
            continue
        seen.add(model_number)

        # Image from link href
        image_url = None
        if el.name == "a":
            href = el.get("href", "")
            if href and not href.startswith("http"):
                image_url = BASE + href + "img/banner.png"
            img = el.find("img")
            if img and img.get("src"):
                src = img["src"]
                if not src.startswith("http"):
                    src = BASE + src
                if "banner" in src:
                    image_url = src

        items.append({
            "model_number": model_number,
            "car_name": car_name,
            "car_name_en": None,
            "series": "premium_unlimited",
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


async def scrape_unlimited_series() -> list[dict]:
    """Scrape Tomica Premium Unlimited series."""
    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        resp = await client.get(URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        items = parse_unlimited_page(soup)
        print(f"  {URL} → {len(items)} Premium Unlimited items")
        return items

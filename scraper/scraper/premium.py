"""Scrape Tomica Premium lineup from takaratomy.co.jp."""

import httpx
from bs4 import BeautifulSoup
import re
import unicodedata

URL = "https://www.takaratomy.co.jp/products/tomica/tomicabrand/premium/"
IMAGE_BASE = "https://www.takaratomy.co.jp/products/tomica/tomicabrand/premium/"


def _normalize_fullwidth(text: str) -> str:
    """Convert full-width numbers/letters to ASCII (e.g., ２３ → 23)."""
    return unicodedata.normalize("NFKC", text)


def parse_premium_page(soup: BeautifulSoup) -> list[dict]:
    """Parse Premium Tomica listing page.

    Car names use full-width numbers: "２３　トヨタ セリカ ＧＴ－ＦＯＵＲ ＲＣ"
    These appear in img alt text and link title attributes.
    """
    items = []
    seen = set()

    # Look for all text that matches premium number pattern
    # Check img alt texts and link titles
    for el in soup.find_all(["a", "img"]):
        text = el.get("alt") or el.get("title") or ""
        text = _normalize_fullwidth(text).strip()

        # Match "NN CarName" pattern (2-digit number + full-width space or regular space)
        match = re.match(r"(\d{2})\s+(.+?)(?:\s*（.*）)?$", text)
        if not match:
            continue

        num = int(match.group(1))
        car_name = match.group(2).strip()
        # Remove "トミカプレミアム発売記念仕様" suffix (commemorative edition)
        car_name = re.sub(r'\s*（トミカプレミアム発売記念仕様）', '', car_name)

        model_number = f"TP.{num:02d}"

        # Skip duplicates (commemorative vs regular)
        if model_number in seen:
            continue
        seen.add(model_number)

        # Find image
        image_url = None
        if el.name == "a":
            href = el.get("href", "")
            if href and not href.startswith("http"):
                # Product page path → construct banner image URL
                image_url = IMAGE_BASE + href + "img/img-01.png"
            img = el.find("img")
            if img and img.get("src"):
                src = img["src"]
                if not src.startswith("http"):
                    src = IMAGE_BASE + src
                if "banner" in src or "img-01" in src:
                    image_url = src
        elif el.name == "img":
            src = el.get("src", "")
            if src and ("banner" in src or "img-01" in src):
                if not src.startswith("http"):
                    src = IMAGE_BASE + src
                image_url = src

        items.append({
            "model_number": model_number,
            "car_name": car_name,
            "car_name_en": None,
            "series": "premium",
            "is_first_edition": False,
            "manufacturer": _guess_manufacturer(car_name),
            "vehicle_type": None,
            "body_color": [],
            "release_date": None,
            "retired": False,
            "image_url": image_url,
            "source": "official",
            "metadata": {},
        })

    return items


def _guess_manufacturer(car_name: str) -> str | None:
    """Guess manufacturer from Premium car name."""
    brands = {
        "トヨタ": "Toyota", "日産": "Nissan", "ホンダ": "Honda",
        "マツダ": "Mazda", "スバル": "Subaru", "三菱": "Mitsubishi",
        "スズキ": "Suzuki", "フェラーリ": "Ferrari", "ランボルギーニ": "Lamborghini",
        "ポルシェ": "Porsche", "メルセデス": "Mercedes-Benz", "BMW": "BMW",
        "アウディ": "Audi", "フォルクスワーゲン": "Volkswagen",
        "ロータス": "Lotus", "ジャガー": "Jaguar",
    }
    for jp, en in brands.items():
        if jp in car_name:
            return en
    return None


async def scrape_premium_series() -> list[dict]:
    """Scrape Tomica Premium series."""
    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        resp = await client.get(URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        items = parse_premium_page(soup)
        print(f"  {URL} → {len(items)} Premium items")
        return items

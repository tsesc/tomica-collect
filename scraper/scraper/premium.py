"""Scrape Tomica Premium lineup from takaratomy.co.jp."""

import asyncio
import httpx
from bs4 import BeautifulSoup
import re
import unicodedata

LINEUP_URL = "https://www.takaratomy.co.jp/products/tomica/tomicabrand/premium/lineup/"
IMAGE_BASE = "https://www.takaratomy.co.jp/products/tomica/tomicabrand/premium/"


def _normalize_fullwidth(text: str) -> str:
    """Convert full-width numbers/letters to ASCII (e.g., ２３ → 23)."""
    return unicodedata.normalize("NFKC", text)


def _guess_manufacturer(car_name: str) -> str | None:
    """Guess manufacturer from Premium car name."""
    brands = {
        "トヨタ": "Toyota", "日産": "Nissan", "ホンダ": "Honda",
        "マツダ": "Mazda", "スバル": "Subaru", "SUBARU": "Subaru",
        "三菱": "Mitsubishi", "スズキ": "Suzuki",
        "フェラーリ": "Ferrari", "ランボルギーニ": "Lamborghini",
        "ポルシェ": "Porsche", "メルセデス": "Mercedes-Benz", "BMW": "BMW",
        "アウディ": "Audi", "フォルクスワーゲン": "Volkswagen",
        "ロータス": "Lotus", "ジャガー": "Jaguar", "テスラ": "Tesla",
        "モーリス": "Morris", "ブガッティ": "Bugatti",
        "航空自衛隊": None, "自衛隊": None,
        "F40": "Ferrari", "F50": "Ferrari", "ラフェラーリ": "Ferrari",
        "エンツォ": "Ferrari",
    }
    for jp, en in brands.items():
        if jp in car_name:
            return en
    return None


def parse_premium_lineup(soup: BeautifulSoup) -> list[dict]:
    """Parse the Premium lineup page.

    Each product is in an <a> tag with a thumb image whose alt text contains
    the number and car name (often in full-width characters).
    Also extract the image URL from the <img> tag's src.
    """
    items = []
    seen = set()

    # Strategy 1: Parse <a> tags containing <img> with alt text matching "NN car_name"
    for a_tag in soup.find_all("a"):
        img = a_tag.find("img")
        if not img:
            continue

        # Check alt text for number + car name pattern
        alt = img.get("alt") or ""
        alt = _normalize_fullwidth(alt).strip()

        match = re.match(r"(\d{1,2})\s+(.+)", alt)
        if not match:
            continue

        num = int(match.group(1))
        car_name = match.group(2).strip()
        # Remove commemorative edition suffixes
        car_name = re.sub(r'\s*[(（]トミカプレミアム発売記念仕様[)）]', '', car_name)

        model_number = f"TP.{num:02d}"
        if model_number in seen:
            continue
        seen.add(model_number)

        # Resolve image URL
        image_url = None
        src = img.get("src", "")
        if src:
            src = src.strip()
            if src.startswith("../"):
                image_url = IMAGE_BASE + src[3:]
            elif src.startswith("http"):
                image_url = src
            else:
                image_url = LINEUP_URL + src

        # Try to get a higher quality image from the product page
        href = a_tag.get("href", "")
        if href and not href.startswith("http") and not href.startswith("#"):
            product_img = IMAGE_BASE + href.lstrip("../").lstrip("./") + "img/img-01.png"
            # Use product page image as primary, thumb as fallback
            image_url = product_img

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

    # Strategy 2: Also check title attributes on <a> tags
    for el in soup.find_all(["a", "img"]):
        text = el.get("title") or ""
        text = _normalize_fullwidth(text).strip()
        match = re.match(r"(\d{1,2})\s+(.+?)(?:\s*[(（].*[)）])?$", text)
        if not match:
            continue

        num = int(match.group(1))
        car_name = match.group(2).strip()
        car_name = re.sub(r'\s*[(（]トミカプレミアム発売記念仕様[)）]', '', car_name)
        model_number = f"TP.{num:02d}"
        if model_number in seen:
            continue
        seen.add(model_number)

        image_url = None
        if el.name == "img":
            src = el.get("src", "")
            if src:
                if src.startswith("../"):
                    image_url = IMAGE_BASE + src[3:]
                elif not src.startswith("http"):
                    image_url = LINEUP_URL + src
                else:
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

    # Sort by number
    items.sort(key=lambda x: int(x["model_number"].replace("TP.", "")))
    return items


async def scrape_premium_series() -> list[dict]:
    """Scrape Tomica Premium series from lineup page."""
    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        resp = await client.get(LINEUP_URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        items = parse_premium_lineup(soup)
        print(f"  {LINEUP_URL} → {len(items)} Premium items")
        return items

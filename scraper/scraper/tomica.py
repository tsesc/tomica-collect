"""Scrape Tomica regular series catalog from takaratomy.co.jp."""

import asyncio
import httpx
from bs4 import BeautifulSoup
import re

BASE = "https://www.takaratomy.co.jp/products/tomica/lineup/regular"
IMAGE_BASE = "https://www.takaratomy.co.jp/products/tomica"
PAGES = [
    f"{BASE}/",
    f"{BASE}/021-040.htm",
    f"{BASE}/041-060.htm",
    f"{BASE}/061-080.htm",
    f"{BASE}/081-100.htm",
    f"{BASE}/101-120.htm",
    f"{BASE}/121-140.htm",
    f"{BASE}/141-150.htm",
]


def parse_page(soup: BeautifulSoup) -> list[dict]:
    """Parse a single listing page.

    Structure:
      div.lineup-box
        div.title-box > p.CarName  "No.1 日産 スカイライン GT-R(BNR34) パトロールカー"
        div.car-pic > img
        p.mark-action  "サスペンション"
    """
    items = []

    for box in soup.select("div.lineup-box"):
        car_name_el = box.select_one(".CarName")
        if not car_name_el:
            continue

        text = car_name_el.get_text(strip=True)
        match = re.match(r"(No\.\d+)\s+(.+)", text)
        if not match:
            continue

        model_number = match.group(1)
        car_name = match.group(2)

        # Image — two HTML layouts exist:
        #   Standard: div.car-pic > img
        #   Slider:   ul.lp-pic-zone > li > img (No.135, No.140, etc.)
        image_url = None
        img = box.select_one("div.car-pic img") or box.select_one("ul.lp-pic-zone img")
        if img and img.get("src"):
            src = img["src"]
            if src.startswith("../../"):
                src = IMAGE_BASE + "/" + src.replace("../../", "")
            elif src.startswith("../"):
                src = IMAGE_BASE + "/lineup/" + src.replace("../", "")
            elif not src.startswith("http"):
                src = f"{BASE}/{src}"
            image_url = src

        # Features
        features = None
        feat_el = box.select_one("p.mark-action")
        if feat_el:
            features = feat_el.get_text(strip=True)

        # Guess manufacturer
        manufacturer = _guess_manufacturer(car_name)

        items.append({
            "series": "regular",
            "model_number": model_number,
            "car_name": car_name,
            "image_url": image_url,
            "manufacturer": manufacturer,
            "features": features,
        })

    return items


def _guess_manufacturer(car_name: str) -> str | None:
    """Guess manufacturer from car name."""
    brands = {
        "日産": "Nissan", "トヨタ": "Toyota", "ホンダ": "Honda", "Honda": "Honda",
        "スバル": "Subaru", "マツダ": "Mazda", "三菱": "Mitsubishi", "スズキ": "Suzuki",
        "ダイハツ": "Daihatsu", "いすゞ": "Isuzu", "日野": "Hino", "UD": "UD Trucks",
        "BMW": "BMW", "メルセデス": "Mercedes-Benz", "ポルシェ": "Porsche",
        "ランボルギーニ": "Lamborghini", "フェラーリ": "Ferrari", "アウディ": "Audi",
        "フォルクスワーゲン": "Volkswagen", "ボルボ": "Volvo", "ルノー": "Renault",
        "シボレー": "Chevrolet", "フォード": "Ford", "ジープ": "Jeep",
        "ランドローバー": "Land Rover", "LEXUS": "Lexus", "レクサス": "Lexus",
        "光岡": "Mitsuoka", "コマツ": "Komatsu", "川崎": "Kawasaki",
        "モリタ": "Morita", "豊田": "Toyota", "ハマー": "GM",
        "FIAT": "Fiat", "シトロエン": "Citroen", "プジョー": "Peugeot",
        "キャタピラー": "Caterpillar", "CAT": "Caterpillar",
    }
    for jp, en in brands.items():
        if jp in car_name:
            return en
    return None


async def scrape_regular_series() -> list[dict]:
    """Scrape all regular Tomica series pages concurrently."""

    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:

        async def fetch(url: str) -> list[dict]:
            try:
                resp = await client.get(url, timeout=30)
                resp.raise_for_status()
                soup = BeautifulSoup(resp.content, "lxml")
                items = parse_page(soup)
                print(f"  {url} → {len(items)} items")
                return items
            except Exception as e:
                print(f"  {url} → Error: {e}")
                return []

        results = await asyncio.gather(*[fetch(url) for url in PAGES])

    return [item for sublist in results for item in sublist]

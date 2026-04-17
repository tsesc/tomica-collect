"""Scrape Tomica Limited Vintage (TLV + TLV NEO) from minicar.tomytec.co.jp."""

import asyncio
import httpx
from bs4 import BeautifulSoup
import re

API_URL = "https://minicar.tomytec.co.jp/product/api/search.php"
IMAGE_API = "https://minicar.tomytec.co.jp/common/api/image.php"


def _parse_results_html(html: str) -> list[dict]:
    """Parse product list HTML returned by the AJAX API.

    Structure per item:
      <li><a href="/product/detail.html?id=XXX">
        <div class="thumb"><img src="..." alt="LV-86h ポルシェ911S（赤）67年式"></div>
        <div class="wrap">
          <div class="category">トミカリミテッドヴィンテージ</div>
          <div class="spec">
            <h3>LV-86h ポルシェ911S（赤）67年式</h3>
            <p>発売時期：2026年9月<br>価格：4,620円（税込）<br>スケール：1/64<br>
               自動車の発売年代：1960年代<br>自動車メーカー：輸入車</p>
          </div>
        </div>
      </a></li>
    """
    soup = BeautifulSoup(html, "lxml")
    items = []

    for li in soup.find_all("li"):
        h3 = li.find("h3")
        if not h3:
            continue

        full_name = h3.get_text(strip=True)
        # Extract model code: "LV-86h", "LV-N294c", etc.
        code_match = re.match(r"(LV-N?\d+\w*)\s+(.*)", full_name)
        if not code_match:
            continue

        model_number = code_match.group(1)
        car_name = code_match.group(2).strip()

        # Category
        cat_el = li.find("div", class_="category")
        category = cat_el.get_text(strip=True) if cat_el else ""
        is_neo = "NEO" in category

        # Image
        img = li.find("img")
        image_url = None
        if img and img.get("src"):
            src = img["src"]
            if not src.startswith("http"):
                src = "https://minicar.tomytec.co.jp" + src
            image_url = src

        # Parse spec details
        spec_el = li.find("p")
        spec_text = spec_el.get_text(separator="\n", strip=True) if spec_el else ""

        release_date = None
        price = None
        scale = None
        era = None
        manufacturer = None

        for line in spec_text.split("\n"):
            line = line.strip()
            if line.startswith("発売時期："):
                release_date = line.replace("発売時期：", "").strip()
            elif line.startswith("価格："):
                price = line.replace("価格：", "").strip()
            elif line.startswith("スケール："):
                scale = line.replace("スケール：", "").strip()
            elif line.startswith("自動車の発売年代："):
                era = line.replace("自動車の発売年代：", "").strip()
            elif line.startswith("自動車メーカー："):
                manufacturer = line.replace("自動車メーカー：", "").strip()

        series = "limited_vintage"

        items.append({
            "model_number": model_number,
            "car_name": car_name,
            "car_name_en": None,
            "series": series,
            "is_neo": is_neo,
            "is_first_edition": False,
            "manufacturer": manufacturer,
            "vehicle_type": None,
            "body_color": [],
            "release_date": release_date,
            "scale": scale,
            "era": era,
            "price": price,
            "retired": False,
            "image_url": image_url,
            "source": "official",
            "metadata": {},
        })

    return items


async def scrape_tlv_series() -> list[dict]:
    """Scrape all TLV + TLV NEO products from Tomytec API."""
    all_items: list[dict] = []
    semaphore = asyncio.Semaphore(5)

    async with httpx.AsyncClient(
        headers={
            "User-Agent": "TomicaCollect-Scraper/1.0 (personal project)",
            "X-Requested-With": "XMLHttpRequest",
        },
        follow_redirects=True,
    ) as client:
        # First request to get total pages
        resp = await client.get(API_URL, params={"series_id": 2, "page": 1}, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        total_pages = data.get("pages", 1)
        print(f"  TLV API: {total_pages} pages")

        # Parse first page
        items = _parse_results_html(data.get("dblineup_src", ""))
        all_items.extend(items)
        print(f"  Page 1 → {len(items)} items")

        # Fetch remaining pages concurrently
        async def fetch_page(page: int) -> list[dict]:
            async with semaphore:
                r = await client.get(API_URL, params={"series_id": 2, "page": page}, timeout=30)
                r.raise_for_status()
                d = r.json()
                page_items = _parse_results_html(d.get("dblineup_src", ""))
                if page % 20 == 0 or page == total_pages:
                    print(f"  Page {page}/{total_pages} → {len(page_items)} items (running total: {len(all_items) + len(page_items)})")
                return page_items

        results = await asyncio.gather(
            *[fetch_page(p) for p in range(2, total_pages + 1)]
        )
        for page_items in results:
            all_items.extend(page_items)

    return all_items

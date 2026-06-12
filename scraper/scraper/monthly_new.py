"""Scrape monthly new-product pages from takaratomy.co.jp.

URL pattern: https://www.takaratomy.co.jp/products/tomica/new/{YYMM}.htm
The bare /new/ index is a meta-refresh to the latest month, so we probe
the current month plus the next few months (pages are published early).

Page structure (verified 2026-06):
  h2.series-titles            series block title
  div.category_tomica         one product
    h3.CarName                "No.19 ホンダ Super-ONE" (may contain <br>)
    p.CarPrice                "2026年6月発売予定 メーカー希望小売価格 594円(税込)"
    ul.lp-pic-zone img        relative src e.g. "images/2606/pic_019_01.webp"
    p.mark-action             feature text (e.g. サスペンション)
"""

import asyncio
import re
from datetime import date

import httpx
from bs4 import BeautifulSoup

from .tomica import _guess_manufacturer

BASE_URL = "https://www.takaratomy.co.jp/products/tomica/new/"
HEADERS = {"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"}
REQUEST_DELAY = 2.0  # polite delay between page fetches
LOOKAHEAD_MONTHS = 3  # official pages appear 1-3 months early

# Ordered: longer / more specific titles must come first.
SERIES_TITLE_MAP: list[tuple[str, str]] = [
    ("トミカプレミアムunlimited", "premium_unlimited"),
    ("トミカプレミアムRacing", "premium"),
    ("トミカプレミアム", "premium"),
    ("ドリームトミカ", "dream"),
    ("ディズニートミカ", "disney"),
    ("カーズ トミカ", "cars"),
    ("カーズトミカ", "cars"),
    ("トミカギフトセット", "giftset"),
    ("トミカワールド", "town"),
    ("トミカシリーズ", "regular"),
]

MODEL_NUMBER_RE = re.compile(r"^((?:No\.\d+|RD-\d+|TP\.?\d+))\s*(.*)")
RELEASE_RE = re.compile(r"(\d{4})年(\d{1,2})月発売予定")
PRICE_RE = re.compile(r"([\d,]+)円")


def _series_for_title(title: str) -> str | None:
    for needle, series in SERIES_TITLE_MAP:
        if needle in title:
            return series
    return None


def _make_item(
    model_number: str,
    car_name: str,
    series: str,
    release_date: str | None,
    image_url: str | None,
    price_jpy: int | None,
    yymm: str,
    features: str | None,
) -> dict:
    metadata: dict = {"yymm": yymm}
    if price_jpy is not None:
        metadata["price_jpy"] = price_jpy
    if features:
        metadata["features"] = features
    return {
        "model_number": model_number,
        "car_name": car_name,
        "car_name_en": None,
        "series": series,
        "is_first_edition": False,
        "manufacturer": _guess_manufacturer(car_name),
        "vehicle_type": None,
        "body_color": [],
        "release_date": release_date,
        "retired": False,
        "image_url": image_url,
        "source": "official",
        "metadata": metadata,
    }


def parse_monthly_page(html: bytes | str, yymm: str) -> list[dict]:
    """Parse one monthly new-product page into standard item dicts."""
    soup = BeautifulSoup(html, "lxml")
    items: list[dict] = []

    for box in soup.select("div.category_tomica"):
        name_el = box.select_one("h3.CarName")
        if not name_el:
            continue

        # CarName may contain <br>; join fragments with a space.
        text = name_el.get_text(separator=" ", strip=True)
        text = re.sub(r"\s+", " ", text)

        match = MODEL_NUMBER_RE.match(text)
        if match and match.group(2):
            model_number = match.group(1)
            car_name = match.group(2).strip()
        else:
            model_number = ""
            car_name = text

        # Series from preceding block title
        h2 = box.find_previous("h2", class_="series-titles")
        series = _series_for_title(h2.get_text(strip=True)) if h2 else None
        if not series:
            title = h2.get_text(strip=True) if h2 else "?"
            print(f"  skip (unmapped series '{title}'): {text}")
            continue

        # Release date + price are mixed in one CarPrice string
        release_date = None
        price_jpy = None
        price_el = box.select_one("p.CarPrice")
        if price_el:
            price_text = price_el.get_text(strip=True)
            rm = RELEASE_RE.search(price_text)
            if rm:
                release_date = f"{rm.group(1)}-{int(rm.group(2)):02d}-01"
            pm = PRICE_RE.search(price_text)
            if pm:
                price_jpy = int(pm.group(1).replace(",", ""))

        # Image (relative to /new/)
        image_url = None
        img = box.select_one("ul.lp-pic-zone img") or box.select_one("img")
        if img and img.get("src"):
            src = img["src"]
            image_url = src if src.startswith("http") else BASE_URL + src.lstrip("./")

        features = None
        feat_el = box.select_one("p.mark-action")
        if feat_el:
            features = feat_el.get_text(strip=True)

        items.append(
            _make_item(
                model_number, car_name, series, release_date,
                image_url, price_jpy, yymm, features,
            )
        )

    return items


def _months_to_try(yymm: str | None) -> list[str]:
    """Explicit yymm → just that month; default → current + next N months."""
    if yymm:
        return [yymm]
    today = date.today()
    months = []
    year, month = today.year, today.month
    for _ in range(LOOKAHEAD_MONTHS + 1):
        months.append(f"{year % 100:02d}{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


async def scrape_monthly_new(yymm: str | None = None) -> list[dict]:
    """Scrape monthly new-product pages.

    Defaults to the current month plus the next 3 (pages go up early).
    Missing months (404) are skipped with a warning, never raised.
    """
    months = _months_to_try(yymm)
    all_items: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    async with httpx.AsyncClient(
        headers=HEADERS,
        follow_redirects=True,
        timeout=30,
    ) as client:
        for i, month in enumerate(months):
            if i:
                await asyncio.sleep(REQUEST_DELAY)
            url = f"{BASE_URL}{month}.htm"
            try:
                resp = await client.get(url)
            except httpx.HTTPError as e:
                print(f"  {url} → Error: {e}")
                continue
            if resp.status_code == 404:
                print(f"  Warning: {url} → 404 (no page for {month})")
                continue
            if resp.status_code >= 400:
                print(f"  Warning: {url} → HTTP {resp.status_code}, skipped")
                continue

            page_items = parse_monthly_page(resp.content, month)
            print(f"  {url} → {len(page_items)} items")
            for item in page_items:
                key = (item["series"], item["model_number"], item["car_name"])
                if key not in seen:
                    seen.add(key)
                    all_items.append(item)

    return all_items

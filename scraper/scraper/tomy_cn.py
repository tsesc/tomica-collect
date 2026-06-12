"""Scrape Tomica listings from tomy.cn (official China site, zh-CN names).

WordPress site. Works over normal HTTPS with a valid certificate — no
verify=False needed. Must use https:// (plain http:// returns 410).

List pages: /tomica_item/{category}, paginated /tomica_item/{category}/page/{N}.
Each product is <li class="item"> with <h3 class="ttl"> (zh-CN name, may
contain "#NN-VV" model code), <p class="img"><img>, and <p class="text">
("NO.xxxxxx<br>系列: ...<br>参考价格：NN"). The 6-digit NO. code maps to the
last 6 digits of the Japanese JAN code.
"""

import asyncio
import re

import httpx
from bs4 import BeautifulSoup

BASE_URL = "https://www.tomy.cn"
HEADERS = {"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"}

# Category slugs from anchor ids on /tomica_item/item
DEFAULT_CATEGORIES = [
    "01diecastcar",      # 多美卡单品
    "02china",           # 多美卡中国版
    "03firststversion",  # 多美卡初回版 (typo is the site's own slug)
    "04event",           # 多美卡特别版
    "05long",            # 多美卡加长版
    "06premium",         # 多美卡旗舰版
    "07disney",          # 迪士尼多美卡
    "10starwars",        # 星球大战
    "11dreamtomica",     # 梦幻多美卡
]

MAX_PAGES_PER_CATEGORY = 50


def _parse_model_number(title: str) -> str | None:
    """'多美卡仿真车 #43-05' → 'No.43'. Returns None if no # code."""
    match = re.search(r"#\s*(\d+)(?:-\d+)?", title)
    if not match:
        return None
    return f"No.{int(match.group(1))}"


def _clean_name(title: str) -> str:
    """Strip the '#NN-VV' code from the title, keep the zh-CN name."""
    name = re.sub(r"#\s*\d+(?:-\d+)?", "", title)
    return re.sub(r"\s+", " ", name).strip()


def parse_list_page(html: str) -> list[dict]:
    """Parse one tomy.cn category list page into item dicts."""
    soup = BeautifulSoup(html, "lxml")
    items: list[dict] = []

    for li in soup.select("ul.l-products li.item"):
        a = li.find("a")
        if not a or not a.get("href"):
            continue
        ttl = li.select_one("h3.ttl")
        title = ttl.get_text(strip=True) if ttl else ""
        if not title:
            continue

        img = li.select_one("p.img img")
        image_url = img.get("src") if img else None

        # p.text: "NO.950783<br>系列: 多美卡单品<br>参考价格：35"
        text_el = li.select_one("p.text")
        text = text_el.get_text("\n") if text_el else ""
        code_match = re.search(r"NO\.\s*(\d{4,})", text, re.IGNORECASE)
        series_match = re.search(r"系列\s*[:：]\s*(.+)", text)
        price_match = re.search(r"参考价格\s*[:：]\s*([\d.]+)", text)

        href = a["href"]
        product_url = href if href.startswith("http") else BASE_URL + href
        product_url = product_url.replace("http://", "https://")

        name = _clean_name(title)
        items.append({
            "model_number": _parse_model_number(title),
            "car_name_zh_cn": name or title,
            "image_url": image_url,
            "product_url": product_url,
            "product_code": code_match.group(1) if code_match else None,
            "series_cn": series_match.group(1).strip() if series_match else None,
            "price_cny": float(price_match.group(1)) if price_match else None,
            "source": "tomy_cn",
        })

    return items


async def _scrape_category(client: httpx.AsyncClient, category: str) -> list[dict]:
    """Fetch all pages of one category, stopping at 404 or an empty page."""
    items: list[dict] = []
    for page in range(1, MAX_PAGES_PER_CATEGORY + 1):
        if page == 1:
            url = f"{BASE_URL}/tomica_item/{category}"
        else:
            url = f"{BASE_URL}/tomica_item/{category}/page/{page}"
        resp = await client.get(url, timeout=30)
        if resp.status_code == 404:
            break
        resp.raise_for_status()
        page_items = parse_list_page(resp.text)
        if not page_items:
            break
        items.extend(page_items)
        await asyncio.sleep(0.5)  # China-hosted; sequential + polite delay
    print(f"  {category} → {len(items)} items")
    return items


async def scrape_tomy_cn(categories: list[str] | None = None) -> list[dict]:
    """Scrape all (or given) tomy.cn Tomica categories, deduped by product_url."""
    cats = categories or DEFAULT_CATEGORIES
    all_items: list[dict] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        for cat in cats:
            for item in await _scrape_category(client, cat):
                if item["product_url"] in seen:
                    continue
                seen.add(item["product_url"])
                all_items.append(item)

    return all_items

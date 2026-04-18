"""Scrape Tomica products from shop.funbox.com.tw (Taiwanese retailer)."""

import asyncio
import math
import re
import httpx

API_BASE = "https://shop.funbox.com.tw/category_products/takaratomy/tomica/XBTMTA.json"
PER_PAGE = 18


def _parse_model_number(title: str) -> str | None:
    """Extract model number from funbox product title.

    Patterns:
      "TOMICA No.072 Jeep Wrangler"         → "No.72"
      "TOMICA 亞版 No.126 恐龍聯結車"        → "No.126"
      "2026 新春紀念車款抽抽樂 (一中盒6台)"    → None (no model number)
    """
    match = re.search(r"No\.(\d+)", title.strip())
    if not match:
        return None
    num = int(match.group(1))
    return f"No.{num}"


def _parse_car_name(title: str) -> str:
    """Extract car name from funbox product title, stripping prefix and suffix."""
    name = title.strip()
    # Remove "TOMICA" prefix and optional "亞版"
    name = re.sub(r"^TOMICA\s*(亞版\s*)?", "", name).strip()
    # Remove "No.XXX " prefix
    name = re.sub(r"^No\.\d+\s+", "", name).strip()
    # Remove trailing "(一般色+初回色)" or similar variant info
    name = re.sub(r"\s*\(一般色\+初回色\)\s*$", "", name).strip()
    return name


def _is_combo_pack(title: str, sku: str) -> bool:
    """Detect if product is a combo pack (一般色+初回色)."""
    return "一般色+初回色" in title or sku.endswith("X2")


def _parse_product(product: dict) -> dict | None:
    """Parse a single funbox API product into our format."""
    title = product.get("title", "").strip()
    model_number = _parse_model_number(title)
    if not model_number:
        return None

    car_name = _parse_car_name(title)
    if not car_name:
        return None

    sku = ""
    if product.get("variants"):
        sku = product["variants"][0].get("sku", "")

    photo = product.get("photo", "")
    if photo and photo.startswith("//"):
        photo = "https:" + photo

    is_first = _is_combo_pack(title, sku)
    is_asia = "亞版" in title or sku.endswith("S1")

    return {
        "model_number": model_number,
        "car_name": car_name,
        "car_name_tw": car_name,
        "series": "regular",
        "is_first_edition": is_first,
        "is_asia_version": is_asia,
        "sku": sku,
        "price_ntd": product.get("price"),
        "image_url": photo,
        "product_url": f"https://shop.funbox.com.tw{product.get('url', '')}",
        "source": "funbox",
        "in_stock": any(
            v.get("inventory_quantity", 0) > 0
            for v in product.get("variants", [])
        ),
    }


async def scrape_funbox() -> list[dict]:
    """Scrape all Tomica products from funbox, all pages concurrently."""

    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        # First page to get total count
        resp = await client.get(API_BASE, params={
            "limit": PER_PAGE, "page": 1, "sort_by": "sell_from-desc",
        }, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        # Parse first page
        products = data if isinstance(data, list) else data.get("products", data)
        total = 178  # Known total; API doesn't return count in response

        # If first page returned data, estimate total pages
        if isinstance(data, dict) and "collection" in data:
            total = data["collection"].get("products_count", total)

        total_pages = math.ceil(total / PER_PAGE)
        print(f"  Funbox: {total} products across {total_pages} pages")

        all_products = list(products) if isinstance(products, list) else []

        # Fetch remaining pages concurrently
        if total_pages > 1:
            async def fetch_page(page: int) -> list:
                r = await client.get(API_BASE, params={
                    "limit": PER_PAGE, "page": page, "sort_by": "sell_from-desc",
                }, timeout=30)
                r.raise_for_status()
                d = r.json()
                return d if isinstance(d, list) else d.get("products", [])

            results = await asyncio.gather(
                *[fetch_page(p) for p in range(2, total_pages + 1)]
            )
            for page_products in results:
                all_products.extend(page_products)

        # Parse and deduplicate by model_number (keep first occurrence, skip combo packs)
        items = []
        seen_models: set[str] = set()
        for product in all_products:
            parsed = _parse_product(product)
            if not parsed:
                continue
            # Skip combo packs if we already have the single version
            key = f"{parsed['model_number']}|{parsed['is_asia_version']}"
            if key in seen_models and parsed["is_first_edition"]:
                continue
            if key in seen_models:
                continue
            seen_models.add(key)
            items.append(parsed)

        return items

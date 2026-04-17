"""Scrape historical Tomica lineup from cochume.com (community blog)."""

import asyncio
import httpx
from bs4 import BeautifulSoup
import re


async def scrape_number_history(client: httpx.AsyncClient, number: int) -> list[dict]:
    """Scrape all historical models for a given Tomica number."""
    # Handle URL patterns
    if number == 21:
        url = f"https://cochume.com/tiomica-no-{number}"  # Known typo on site
    elif 141 <= number <= 150:
        url = f"https://cochume.com/longtomica-no-{number}"
    else:
        url = f"https://cochume.com/tomica-no-{number}"

    try:
        resp = await client.get(url, timeout=30)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
    except Exception:
        # Try fallback URL pattern
        try:
            url = f"https://cochume.com/tomica-no-{number}"
            resp = await client.get(url, timeout=30)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
        except Exception:
            return []

    soup = BeautifulSoup(resp.content, "lxml")
    items: list[dict] = []

    text = soup.get_text()
    lines = text.split('\n')

    current_item: dict | None = None

    for line in lines:
        line = line.strip()

        # Match variant line: "No.X-Y：CarName" or "No.X-Y: CarName"
        match = re.match(r'No\.(\d+)-(\d+)[：:\s]+(.+)', line)
        if match:
            model_num = int(match.group(1))
            variant = int(match.group(2))
            car_name = match.group(3).strip()

            # Clean up car name — remove trailing date fragments if any leaked
            car_name = re.split(r'【', car_name)[0].strip()
            car_name = re.sub(r'\s+', ' ', car_name).strip()
            if not car_name or len(car_name) < 2:
                continue

            current_item = {
                "model_number": f"No.{model_num}",
                "variant": variant,
                "car_name": car_name,
                "series": "regular",
                "is_first_edition": False,
                "source": "community",
                "image_url": None,
                "release_start": None,
                "release_end": None,
            }
            items.append(current_item)
            continue

        # Match sales period: 【販売期間】YYYY/MM〜YYYY/MM or YYYY/MM〜
        if current_item and '販売期間' in line:
            # Extract dates from this line
            dates = re.findall(r'(\d{4})/(\d{2})', line)
            if len(dates) >= 1:
                current_item["release_start"] = f"{dates[0][0]}-{dates[0][1]}"
            if len(dates) >= 2:
                current_item["release_end"] = f"{dates[1][0]}-{dates[1][1]}"

    # Extract images: alt text contains "No.X-Y" pattern (dict lookup, O(n))
    variant_map = {item["variant"]: item for item in items}

    for img in soup.find_all("img"):
        src = img.get("data-src") or img.get("src", "")
        alt = img.get("alt", "")

        if not src or "pagespeed_static" in src or "data:image" in src:
            continue
        if "thumbnail" in src or "logo" in src:
            continue

        alt_match = re.search(r'No\.(\d+)-(\d+)', alt)
        if not alt_match:
            continue

        img_variant = int(alt_match.group(2))
        is_box = "box" in src.lower() or "箱" in alt

        item = variant_map.get(img_variant)
        if item and (item["image_url"] is None or is_box):
            item["image_url"] = src

    return items


async def scrape_all_history() -> list[dict]:
    """Scrape historical data for all Tomica numbers concurrently."""
    semaphore = asyncio.Semaphore(10)

    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:

        async def fetch_with_limit(number: int) -> list[dict]:
            async with semaphore:
                items = await scrape_number_history(client, number)
                count = len(items)
                dated = sum(1 for i in items if i.get("release_start"))
                print(f"  No.{number} → {count} variants ({dated} with dates)")
                await asyncio.sleep(0.3)  # Polite delay per request
                return items

        results = await asyncio.gather(
            *[fetch_with_limit(n) for n in range(1, 151)]
        )

    return [item for sublist in results for item in sublist]

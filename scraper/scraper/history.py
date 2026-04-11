"""Scrape historical Tomica lineup from cochume.com (community blog)."""

import httpx
from bs4 import BeautifulSoup
import re
import time


def scrape_number_history(client: httpx.Client, number: int) -> list[dict]:
    """Scrape all historical models for a given Tomica number."""
    # Handle URL patterns
    if number == 21:
        url = f"https://cochume.com/tiomica-no-{number}"  # Known typo on site
    elif 141 <= number <= 150:
        url = f"https://cochume.com/longtomica-no-{number}"
    else:
        url = f"https://cochume.com/tomica-no-{number}"

    try:
        resp = client.get(url, timeout=30)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
    except Exception:
        # Try fallback URL pattern
        try:
            url = f"https://cochume.com/tomica-no-{number}"
            resp = client.get(url, timeout=30)
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
        except Exception:
            return []

    soup = BeautifulSoup(resp.content, "lxml")
    items = []

    # The page has entries like "No.1-7: Car Name" with release periods
    # Look for headings or bold text with the pattern No.X-Y
    text = soup.get_text()

    # Split text into lines for cleaner parsing
    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        match = re.match(r'No\.(\d+)-(\d+)[：:\s]+(.+)', line)
        if not match:
            continue

        model_num = int(match.group(1))
        variant = int(match.group(2))
        car_name = match.group(3).strip()

        # Clean up car name
        car_name = re.sub(r'\s+', ' ', car_name).strip()
        # Remove trailing noise (release dates, actions, etc that leaked in)
        car_name = re.split(r'\d{4}/\d{2}', car_name)[0].strip()
        if not car_name or len(car_name) < 2:
            continue

        item = {
            "model_number": f"No.{model_num}",
            "variant": variant,
            "car_name": car_name,
            "series": "regular",
            "is_first_edition": False,
            "source": "community",
            "image_url": None,
        }

        items.append(item)

    # Extract images: alt text contains "No.X-Y" pattern
    # Images use both src and data-src (lazy loading)
    for img in soup.find_all("img"):
        src = img.get("data-src") or img.get("src", "")
        alt = img.get("alt", "")

        # Skip placeholders, logos, thumbnails
        if not src or "pagespeed_static" in src or "data:image" in src:
            continue
        if "thumbnail" in src or "logo" in src:
            continue

        # Match variant from alt text: "No.35-7" or "トミカNo.35-7"
        alt_match = re.search(r'No\.(\d+)-(\d+)', alt)
        if not alt_match:
            continue

        img_num = int(alt_match.group(1))
        img_variant = int(alt_match.group(2))

        # Prefer box image, then front, skip rear/side duplicates
        is_box = "box" in src.lower() or "箱" in alt
        is_front = "front" in src.lower() or "前" in alt

        # Find matching item and set image (prefer box > front > any)
        for item in items:
            if item["variant"] == img_variant:
                if item["image_url"] is None:
                    item["image_url"] = src
                elif is_box:
                    item["image_url"] = src  # box photo preferred
                elif is_front and "box" not in (item["image_url"] or ""):
                    item["image_url"] = src  # front preferred over other
                break

    return items


def scrape_all_history() -> list[dict]:
    """Scrape historical data for all Tomica numbers."""
    all_items: list[dict] = []

    with httpx.Client(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        for number in range(1, 151):
            print(f"  No.{number}...", end=" ", flush=True)
            items = scrape_number_history(client, number)
            all_items.extend(items)
            print(f"{len(items)} variants")

            # Rate limit: 1 request per 1.5 seconds
            time.sleep(1.5)

    return all_items

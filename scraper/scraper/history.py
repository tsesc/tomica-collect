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
        }

        items.append(item)

    # Try to extract release periods
    for match in re.finditer(
        r'(\d{4}/\d{2})〜(\d{4}/\d{2}|\s*$)',
        text,
    ):
        start = match.group(1)
        end = match.group(2).strip() if match.group(2).strip() else None
        # Associate with the nearest item (rough heuristic)
        # This is best-effort

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

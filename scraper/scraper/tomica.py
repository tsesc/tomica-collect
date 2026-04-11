"""Scrape Tomica regular series catalog from takaratomy.co.jp."""

import httpx
from bs4 import BeautifulSoup
import json
import re
import time
from pathlib import Path

BASE_URL = "https://www.takaratomy.co.jp/products/tomica/lineup/search.htm"
DETAIL_BASE = "https://www.takaratomy.co.jp/products/tomica"

def fetch_catalog_page(client: httpx.Client) -> BeautifulSoup:
    resp = client.get(BASE_URL, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.content, "lxml")

def parse_listing(soup: BeautifulSoup) -> list[dict]:
    items = []
    for card in soup.select(".lineup_list li, .itemList li, .product-item"):
        item = {}
        number_el = card.select_one(".number, .item-number, .no")
        if number_el:
            item["model_number"] = number_el.get_text(strip=True)
        name_el = card.select_one(".name, .item-name, .ttl, a")
        if name_el:
            item["car_name"] = name_el.get_text(strip=True)
        img = card.select_one("img")
        if img and img.get("src"):
            src = img["src"]
            if not src.startswith("http"):
                src = f"{DETAIL_BASE}/{src.lstrip('/')}"
            item["image_url"] = src
        link = card.select_one("a[href]")
        if link:
            href = link["href"]
            if not href.startswith("http"):
                href = f"{DETAIL_BASE}/{href.lstrip('/')}"
            item["detail_url"] = href
        if item.get("model_number") or item.get("car_name"):
            items.append(item)
    return items

def enrich_item(client: httpx.Client, item: dict) -> dict:
    detail_url = item.get("detail_url")
    if not detail_url:
        return item
    try:
        resp = client.get(detail_url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "lxml")
        for row in soup.select("table tr, .spec-item, dl"):
            text = row.get_text()
            if "メーカー" in text or "manufacturer" in text.lower():
                val = row.select_one("td:last-child, dd")
                if val:
                    item["manufacturer"] = val.get_text(strip=True)
        body_text = soup.get_text()
        color_match = re.search(r"カラー[：:]?\s*(.+?)(?:\n|$)", body_text)
        if color_match:
            item["body_color"] = [c.strip() for c in color_match.group(1).split("、")]
    except Exception:
        pass
    return item

def scrape_regular_series() -> list[dict]:
    with httpx.Client(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"},
        follow_redirects=True,
    ) as client:
        soup = fetch_catalog_page(client)
        items = parse_listing(soup)
        enriched = []
        for i, item in enumerate(items):
            enriched.append(enrich_item(client, item))
            if i % 10 == 0 and i > 0:
                time.sleep(1)
        return enriched

"""Insert AI-enriched new-release items into Supabase tomica_catalog."""

import logging
import re
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"(?P<y>\d{4})年(?P<m>\d{1,2})月(?:(?P<d>\d{1,2})日)?")


def parse_release_date(value: Optional[str]) -> Optional[str]:
    """Parse a Japanese release-date string into YYYY-MM-DD or return None.

    Accepts forms like "2026年9月", "2026年9月15日", "2026年09月".
    Returns None for empty input, "未定", or anything that does not match.
    """
    if not value:
        return None
    m = _DATE_RE.search(value)
    if not m:
        return None
    y = int(m.group("y"))
    mo = int(m.group("m"))
    d = int(m.group("d")) if m.group("d") else 1
    return f"{y:04d}-{mo:02d}-{d:02d}"


_CATALOG_KEYS = {
    "series", "model_number", "car_name", "car_name_en", "car_name_zh_tw",
    "manufacturer", "image_url", "attributes", "description_en", "description_zh_tw",
}


def build_row(item: dict) -> dict[str, Any]:
    """Shape an enriched scrape item into a tomica_catalog row payload."""
    row: dict[str, Any] = {k: item[k] for k in _CATALOG_KEYS if k in item}
    row["source"] = "official"
    row["release_date"] = parse_release_date(item.get("release_date"))

    metadata = dict(item.get("metadata") or {})
    price = item.get("price")
    if price:
        metadata["price"] = price
    row["metadata"] = metadata

    return row


def import_new_releases(
    items: list[dict],
    supabase_url: str,
    supabase_key: str,
    batch_size: int = 200,
) -> tuple[int, list[dict]]:
    """Bulk-insert enriched items into tomica_catalog with ON CONFLICT DO NOTHING.

    Returns (inserted_count_estimate, failures). The estimate is len(items) minus
    HTTP-level failures; PostgREST does not report per-row conflict counts when
    we use Prefer: resolution=ignore-duplicates.
    """
    if not items:
        return (0, [])

    rows = [build_row(it) for it in items]
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=ignore-duplicates",
    }
    url = f"{supabase_url}/rest/v1/tomica_catalog?on_conflict=series,model_number"

    failures: list[dict] = []
    inserted = 0
    for start in range(0, len(rows), batch_size):
        chunk = rows[start:start + batch_size]
        try:
            resp = httpx.post(url, json=chunk, headers=headers, timeout=60.0)
            resp.raise_for_status()
            inserted += len(chunk)
        except httpx.HTTPError as e:
            logger.warning("Insert batch [%d..%d) failed: %s", start, start + len(chunk), e)
            for r in chunk:
                failures.append({
                    "series": r.get("series"),
                    "model_number": r.get("model_number"),
                    "error": str(e),
                })

    return (inserted, failures)

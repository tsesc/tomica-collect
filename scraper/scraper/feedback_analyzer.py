"""Analyze recognition_log AI-vs-user mismatches → tomica_catalog.correction_hints.

When recognition_log.user_chosen_catalog_id differs from original_top1_catalog_id,
the AI guessed wrong. This module aggregates those misses into per-catalog-item
hints so matchCandidates() can boost the items users actually picked.

correction_hints JSONB format (written on the row the AI wrongly picked):
    {
      "confused_with": [{"catalog_id": "<uuid>", "count": <int>}, ...],
      "updated_at": "<ISO8601 UTC>"
    }

Dry-run by default; pass --apply to PATCH rows via Supabase REST.
"""

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

DEFAULT_SUPABASE_URL = "https://qhvtipfmxfdlpolckubb.supabase.co"
DEFAULT_MIN_COUNT = 2
PAGE_SIZE = 1000


def aggregate_corrections(
    rows: list[dict], min_count: int = DEFAULT_MIN_COUNT
) -> dict[str, list[dict]]:
    """Aggregate correction rows into {original_top1_id: confused_with list}.

    Only (original, chosen) pairs seen >= min_count times are kept.
    confused_with lists are sorted by count desc, then catalog_id for stability.
    """
    pairs: Counter[tuple[str, str]] = Counter()
    for row in rows:
        orig = row.get("original_top1_catalog_id")
        chosen = row.get("user_chosen_catalog_id")
        if not orig or not chosen or orig == chosen:
            continue
        pairs[(orig, chosen)] += 1

    hints: dict[str, list[dict]] = defaultdict(list)
    for (orig, chosen), count in pairs.items():
        if count >= min_count:
            hints[orig].append({"catalog_id": chosen, "count": count})

    for orig in hints:
        hints[orig].sort(key=lambda h: (-h["count"], h["catalog_id"]))
    return dict(hints)


def build_hint_payload(confused_with: list[dict], now: datetime | None = None) -> dict:
    """Wrap a confused_with list into the correction_hints JSONB payload."""
    ts = (now or datetime.now(timezone.utc)).isoformat()
    return {"confused_with": confused_with, "updated_at": ts}


def _supabase_config() -> tuple[str, dict, bool]:
    """Return (rest base URL, headers, has_write_key)."""
    url = os.environ.get("SUPABASE_URL", DEFAULT_SUPABASE_URL)
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
    api_key = service_key or anon_key
    if not api_key:
        raise SystemExit("Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY for dry-run).")
    headers = {"apikey": api_key, "Authorization": f"Bearer {api_key}"}
    return f"{url}/rest/v1", headers, bool(service_key)


def fetch_correction_rows(base: str, headers: dict) -> list[dict]:
    """Fetch recognition_log rows where both catalog ids are set (paginated)."""
    rows: list[dict] = []
    offset = 0
    while True:
        resp = httpx.get(
            f"{base}/recognition_log"
            "?select=original_top1_catalog_id,user_chosen_catalog_id"
            "&original_top1_catalog_id=not.is.null"
            "&user_chosen_catalog_id=not.is.null"
            f"&order=created_at&offset={offset}&limit={PAGE_SIZE}",
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += len(batch)
    return rows


def apply_hints(hints: dict[str, list[dict]], base: str, headers: dict) -> int:
    """PATCH correction_hints onto tomica_catalog rows. Returns success count."""
    write_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}
    now = datetime.now(timezone.utc)
    success = 0
    for catalog_id, confused_with in hints.items():
        resp = httpx.patch(
            f"{base}/tomica_catalog?id=eq.{catalog_id}",
            headers=write_headers,
            json={"correction_hints": build_hint_payload(confused_with, now)},
            timeout=10,
        )
        if resp.status_code < 300:
            success += 1
        else:
            print(f"  ! Failed {catalog_id}: HTTP {resp.status_code}")
    return success


def write_hints_sql(hints: dict[str, list[dict]], path: Path) -> None:
    """Write UPDATE statements for manual/MCP execution."""
    now = datetime.now(timezone.utc)
    lines = []
    for catalog_id, confused_with in sorted(hints.items()):
        payload = json.dumps(build_hint_payload(confused_with, now)).replace("'", "''")
        lines.append(
            f"UPDATE tomica_catalog SET correction_hints = '{payload}'::jsonb "
            f"WHERE id = '{catalog_id}';"
        )
    path.write_text("\n".join(lines) + "\n")


def analyze(apply: bool = False, min_count: int = DEFAULT_MIN_COUNT) -> dict[str, list[dict]]:
    """Full pipeline: fetch → aggregate → report; write to DB when apply=True."""
    base, headers, has_write_key = _supabase_config()

    print("Fetching recognition_log corrections...")
    rows = fetch_correction_rows(base, headers)
    mismatches = [
        r for r in rows
        if r["original_top1_catalog_id"] != r["user_chosen_catalog_id"]
    ]
    print(f"Found {len(rows)} logged choices, {len(mismatches)} AI misses")

    hints = aggregate_corrections(mismatches, min_count=min_count)
    if not hints:
        print(f"No patterns with count >= {min_count}. Nothing to do.")
        return hints

    print(f"Patterns (count >= {min_count}) on {len(hints)} catalog items:")
    for catalog_id, confused_with in sorted(hints.items()):
        for hint in confused_with:
            print(f"  {catalog_id} → actually {hint['catalog_id']} (x{hint['count']})")

    data_dir = Path(__file__).parent.parent / "data"
    data_dir.mkdir(exist_ok=True)
    sql_path = data_dir / "correction_hints.sql"
    write_hints_sql(hints, sql_path)
    print(f"SQL saved: {len(hints)} statements → {sql_path}")

    if not apply:
        print("Dry-run (default). Re-run with --apply to write to DB.")
        return hints

    if not has_write_key:
        print("No SUPABASE_SERVICE_ROLE_KEY — cannot apply. Use the SQL file via Supabase MCP.")
        return hints

    print("Writing to DB...")
    success = apply_hints(hints, base, headers)
    print(f"Updated {success}/{len(hints)} catalog rows")
    return hints


def run(args: list[str]) -> None:
    """CLI entry: scrape analyze-feedback [--apply] [--min-count N]."""
    apply = "--apply" in args
    min_count = DEFAULT_MIN_COUNT
    if "--min-count" in args:
        idx = args.index("--min-count")
        try:
            min_count = int(args[idx + 1])
        except (IndexError, ValueError):
            raise SystemExit("--min-count requires an integer")
    analyze(apply=apply, min_count=min_count)

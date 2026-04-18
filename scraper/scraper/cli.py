"""CLI entry point for the Tomica scraper."""

import asyncio
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from .tomica import scrape_regular_series
from .history import scrape_all_history
from .dream import scrape_dream_series
from .premium import scrape_premium_series
from .funbox import scrape_funbox
from .tlv import scrape_tlv_series
from .unlimited import scrape_unlimited_series
from .cars import scrape_cars_series
from .dedup import dedup_report, enrich_catalog
from .enrich import enrich_batch
from .classify import classify_batch
from .output import write_json, write_sql_seed


def _backup(data_dir: Path, filename: str) -> Path | None:
    """Backup existing data file with timestamp before overwriting. Returns backup path."""
    src = data_dir / filename
    if not src.exists():
        return None
    backup_dir = data_dir / "backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem, suffix = src.stem, src.suffix
    dest = backup_dir / f"{stem}_{ts}{suffix}"
    shutil.copy2(src, dest)
    print(f"  Backed up {filename} → backup/{dest.name}")
    return dest


def _latest_backup(data_dir: Path, prefix: str) -> Path | None:
    """Find the most recent backup file matching prefix."""
    backup_dir = data_dir / "backup"
    if not backup_dir.exists():
        return None
    matches = sorted(backup_dir.glob(f"{prefix}_*.json"), reverse=True)
    return matches[0] if matches else None


def _make_key(item: dict) -> str:
    """Build a unique key for a catalog/history item."""
    variant = item.get("variant", "")
    return f"{item.get('model_number', '')}|{variant}|{item.get('car_name', '')}"


def _diff_items(old_items: list[dict], new_items: list[dict]) -> list[dict]:
    """Return items present in old but missing in new."""
    new_keys = {_make_key(i) for i in new_items}
    return [i for i in old_items if _make_key(i) not in new_keys]


def _check_and_warn(data_dir: Path, prefix: str, new_items: list[dict]) -> None:
    """Compare new scrape against latest backup, warn about missing items."""
    backup_path = _latest_backup(data_dir, prefix)
    if not backup_path:
        return
    old_items = json.loads(backup_path.read_text())
    missing = _diff_items(old_items, new_items)
    if not missing:
        print(f"  ✓ No items lost vs previous run")
        return
    print(f"  ⚠ {len(missing)} items in backup but missing from new scrape:")
    for item in missing[:10]:
        name = item.get("car_name", "?")
        print(f"    - {item.get('model_number', '?')} {name}")
    if len(missing) > 10:
        print(f"    ... and {len(missing) - 10} more")
    print(f"  Run 'scrape recover {prefix}' to merge them back.")


def _cmd_diff(data_dir: Path, prefix: str) -> None:
    """Show diff between current data and latest backup."""
    current_path = data_dir / f"{prefix}.json"
    if not current_path.exists():
        print(f"No current {prefix}.json found.")
        return
    backup_path = _latest_backup(data_dir, prefix)
    if not backup_path:
        print(f"No backup found for {prefix}.")
        return

    current = json.loads(current_path.read_text())
    old = json.loads(backup_path.read_text())

    missing = _diff_items(old, current)
    added = _diff_items(current, old)

    print(f"Comparing {current_path.name} vs {backup_path.name}")
    print(f"  Current: {len(current)} items")
    print(f"  Backup:  {len(old)} items")

    if added:
        print(f"\n  + {len(added)} new items:")
        for item in added[:20]:
            print(f"    + {item.get('model_number', '?')} {item.get('car_name', '?')}")
        if len(added) > 20:
            print(f"    ... and {len(added) - 20} more")

    if missing:
        print(f"\n  - {len(missing)} items lost:")
        for item in missing[:20]:
            print(f"    - {item.get('model_number', '?')} {item.get('car_name', '?')}")
        if len(missing) > 20:
            print(f"    ... and {len(missing) - 20} more")
        print(f"\n  Run 'scrape recover {prefix}' to merge lost items back.")

    if not added and not missing:
        print("\n  No differences found.")


def _cmd_recover(data_dir: Path, prefix: str) -> None:
    """Merge missing items from latest backup into current data."""
    current_path = data_dir / f"{prefix}.json"
    if not current_path.exists():
        print(f"No current {prefix}.json found.")
        return
    backup_path = _latest_backup(data_dir, prefix)
    if not backup_path:
        print(f"No backup found for {prefix}.")
        return

    current = json.loads(current_path.read_text())
    old = json.loads(backup_path.read_text())
    missing = _diff_items(old, current)

    if not missing:
        print("Nothing to recover — no items missing.")
        return

    merged = current + missing
    _backup(data_dir, f"{prefix}.json")
    current_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2))
    print(f"Recovered {len(missing)} items from backup. Total: {len(merged)} items.")
    for item in missing:
        print(f"  + {item.get('model_number', '?')} {item.get('car_name', '?')}")


def main():
    data_dir = Path(__file__).parent.parent / "data"
    args = sys.argv[1:]

    # scrape diff <catalog|history>
    if len(args) >= 2 and args[0] == "diff":
        _cmd_diff(data_dir, args[1])
        return

    # scrape recover <catalog|history>
    if len(args) >= 2 and args[0] == "recover":
        _cmd_recover(data_dir, args[1])
        return

    # scrape enrich — fill missing catalog fields from other sources
    if len(args) >= 1 and args[0] == "enrich":
        _backup(data_dir, "catalog.json")
        changes = enrich_catalog(data_dir)
        if changes:
            print(f"Enriched {len(changes)} items in catalog.json:")
            for c in changes:
                print(f"  {c['model_number']:8s} {c['field']} ← [{c['source']}] {c['new'][:70]}")
        else:
            print("Nothing to enrich — all catalog items already have data.")
        return

    # scrape classify — rule-based attribute extraction (no AI, instant)
    if len(args) >= 1 and args[0] == "classify":
        import os
        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        supabase_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        anon_key = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodnRpcGZteGZkbHBvbGNrdWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjQzNjgsImV4cCI6MjA5MTU0MDM2OH0.MJPwUw6ABTthWKRzmQB8Enh0BF1UMbdJUaKhpHIZ_c0")
        api_key = supabase_key or anon_key

        import httpx as httpx_sync
        headers = {"apikey": api_key, "Authorization": f"Bearer {api_key}"}
        base = f"{supabase_url}/rest/v1"

        # Fetch ALL items without attributes
        print("Fetching items without attributes...")
        all_items: list[dict] = []
        offset = 0
        while True:
            resp = httpx_sync.get(
                f"{base}/tomica_catalog?attributes=is.null&select=id,model_number,car_name,manufacturer,series,release_start&order=model_number&offset={offset}&limit=1000",
                headers=headers, timeout=30,
            )
            batch = resp.json()
            if not batch:
                break
            all_items.extend(batch)
            offset += len(batch)
            if len(batch) < 1000:
                break

        print(f"Found {len(all_items)} items to classify")
        if not all_items:
            print("Nothing to classify!")
            return

        # Classify all items (instant, no API calls)
        results = classify_batch(all_items)
        print(f"Classified: {len(results)} items")

        # Generate SQL
        sql_lines = []
        for item_id, attrs in results.items():
            import json as json_mod
            attrs_json = json_mod.dumps(attrs).replace("'", "''")
            sql_lines.append(f"UPDATE tomica_catalog SET attributes = '{attrs_json}'::jsonb WHERE id = '{item_id}';")

        # Save SQL file
        output_path = data_dir / "classify_updates.sql"
        output_path.write_text("\n".join(sql_lines))
        print(f"SQL saved: {len(sql_lines)} statements → {output_path}")

        # If service role key available, write directly to DB
        if supabase_key and supabase_key != anon_key:
            print("Writing to DB...")
            write_headers = {**headers, "Content-Type": "application/json", "Prefer": "return=minimal"}
            success = 0
            for item_id, attrs in results.items():
                resp = httpx_sync.patch(
                    f"{base}/tomica_catalog?id=eq.{item_id}",
                    headers=write_headers,
                    json={"attributes": attrs},
                    timeout=10,
                )
                if resp.status_code < 300:
                    success += 1
            print(f"Wrote {success}/{len(results)} to DB")
        else:
            print("No service role key — SQL file saved, use Supabase MCP to execute.")
        print("Done!")
        return

    # scrape enrich-attributes — batch AI attribute extraction via Gemini Flash
    if len(args) >= 1 and args[0] == "enrich-attributes":
        import os

        api_key = os.environ.get("GEMINI_API_KEY")
        supabase_url = os.environ.get("SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

        if not api_key:
            print("Error: GEMINI_API_KEY env var is required")
            sys.exit(1)
        if not supabase_url or not service_key:
            print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required")
            sys.exit(1)

        import httpx

        # Fetch items needing enrichment
        print("Fetching catalog items needing attribute enrichment...")
        headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }
        resp = httpx.get(
            f"{supabase_url}/rest/v1/tomica_catalog"
            "?image_url=not.is.null&attributes=is.null"
            "&select=id,model_number,car_name,image_url",
            headers=headers,
            timeout=30.0,
        )
        resp.raise_for_status()
        items = resp.json()
        print(f"Found {len(items)} items to enrich")

        if not items:
            print("Nothing to enrich — all items already have attributes.")
            return

        # Run batch enrichment
        results = asyncio.run(enrich_batch(items, api_key))
        print(f"\nExtracted attributes for {len(results)}/{len(items)} items")

        # Write results back to Supabase
        success = 0
        failed = 0
        for item_id, attrs in results.items():
            try:
                patch_resp = httpx.patch(
                    f"{supabase_url}/rest/v1/tomica_catalog?id=eq.{item_id}",
                    headers=headers,
                    json={"attributes": attrs},
                    timeout=30.0,
                )
                patch_resp.raise_for_status()
                success += 1
            except httpx.HTTPError as e:
                print(f"  Failed to update {item_id}: {e}")
                failed += 1

        print(f"\nDone! Updated: {success}, Failed: {failed}, Skipped: {len(items) - len(results)}")
        return

    if len(args) >= 1 and args[0] == "history":
        print("Scraping historical Tomica lineup (all generations)...")
        items = asyncio.run(scrape_all_history())
        print(f"Found {len(items)} historical variants")
        _backup(data_dir, "history.json")
        _check_and_warn(data_dir, "history", items)
        output_path = data_dir / "history.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "dream":
        print("Scraping Dream Tomica lineup...")
        items = asyncio.run(scrape_dream_series())
        print(f"Found {len(items)} Dream Tomica items")
        _backup(data_dir, "dream.json")
        output_path = data_dir / "dream.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "premium":
        print("Scraping Tomica Premium lineup...")
        items = asyncio.run(scrape_premium_series())
        print(f"Found {len(items)} Premium items")
        _backup(data_dir, "premium.json")
        output_path = data_dir / "premium.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "tlv":
        print("Scraping Tomica Limited Vintage (TLV + TLV NEO)...")
        items = asyncio.run(scrape_tlv_series())
        print(f"Found {len(items)} TLV items")
        _backup(data_dir, "tlv.json")
        output_path = data_dir / "tlv.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "unlimited":
        print("Scraping Tomica Premium Unlimited...")
        items = asyncio.run(scrape_unlimited_series())
        print(f"Found {len(items)} Premium Unlimited items")
        _backup(data_dir, "unlimited.json")
        output_path = data_dir / "unlimited.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "cars":
        print("Scraping Cars Tomica (Pixar)...")
        items = asyncio.run(scrape_cars_series())
        print(f"Found {len(items)} Cars Tomica items")
        _backup(data_dir, "cars.json")
        output_path = data_dir / "cars.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "funbox":
        print("Scraping Tomica from shop.funbox.com.tw...")
        items = asyncio.run(scrape_funbox())
        print(f"Found {len(items)} Funbox items")
        _backup(data_dir, "funbox.json")
        _check_and_warn(data_dir, "funbox", items)
        output_path = data_dir / "funbox.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
    elif len(args) >= 1 and args[0] == "dedup":
        report = dedup_report(data_dir)
        print(report)
        # Also save to file
        output_path = data_dir / "dedup_report.txt"
        output_path.write_text(report)
        print(f"\nReport saved to {output_path}")
    else:
        print("Scraping current Tomica regular series...")
        items = asyncio.run(scrape_regular_series())
        print(f"Found {len(items)} items")
        _backup(data_dir, "catalog.json")
        _backup(data_dir, "seed.sql")
        _check_and_warn(data_dir, "catalog", items)
        write_json(items, data_dir / "catalog.json")
        write_sql_seed(items, data_dir / "seed.sql")
        print("Done!")
        print("\nTip: Run 'scrape history' to also fetch all historical generations.")


if __name__ == "__main__":
    main()

"""CLI entry point for the Tomica scraper."""

import asyncio
import json
import re
import shutil
import sys
from datetime import datetime, timezone
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
from .color_extract import extract_colors_batch
from .image_search import batch_search_images
from .monthly_new import scrape_monthly_new
from .output import write_json, write_sql_seed
from .fandom import (
    scrape_fandom,
    import_to_supabase as fandom_import_to_supabase,
    fetch_fandom_images,
    fandom_sync,
    save_sync_state,
    SyncStateMissing,
    SYNC_STATE_FILE,
)
from .tomy_cn import scrape_tomy_cn
from .tomicars_club import scrape_tomicars_club
from .feedback_analyzer import run as analyze_feedback_run
from . import changelog as changelog_mod

# Whitelist of tomica_catalog columns accepted by `scrape import-snapshots`.
# Snapshot JSON may carry extra scraper-only keys (is_neo, scale, era, price,
# ...) that PostgREST would reject.
CATALOG_COLUMNS = {
    "model_number", "car_name", "car_name_en",
    "car_name_zh_tw", "car_name_zh_hk", "car_name_zh_cn",
    "series", "is_first_edition", "manufacturer", "vehicle_type",
    "body_color", "release_date", "release_start", "release_end",
    "retired", "retired_at", "image_url", "source", "metadata",
}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


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


USAGE = """\
Usage: scrape [command] [options]

Catalog scraping (default: regular series):
  (no command)        Scrape current Tomica regular series (150 models)
  history             Historical regular-series variants
  tlv                 Tomica Limited Vintage (POST API)
  dream               Dream Tomica
  premium             Tomica Premium
  unlimited           Premium Unlimited
  cars                Cars Tomica
  funbox              Taiwan retailer (funbox) data
  fandom              Full Fandom wiki scrape
  fandom-images       Fetch Fandom images
  fandom-import       Import Fandom data into Supabase
  fandom-sync [--init] [--no-images]
                      Incremental Fandom sync (changed pages only)
  tomy-cn             Official China site (zh-CN names)
  tomicars-club       MANUAL-RUN ONLY (data license unconfirmed)
  monthly-new [yymm]  Monthly new-product pages + snapshot changelog
  import-snapshots    Import committed data/snapshots/**/*.json into Supabase

Enrichment / maintenance:
  classify            Rule-based attribute extraction (no AI)
  extract-colors      Pillow pixel-based color extraction (no AI)
  enrich-attributes   Gemini Flash AI attribute extraction (GEMINI_API_KEY)
  enrich              Fill missing catalog fields from other sources
  analyze-feedback [--apply] [--min-count N]
                      recognition_log -> correction_hints
  changelog           Re-print last generated changelog (no re-scrape)
  find-images [N]     Gemini image search for items missing images
  dedup               Cross-source dedup report
  fix-dupes           Fix duplicate entries
  diff <catalog|history>     Diff data files against backup
  recover <catalog|history>  Merge items from backup
"""


def main():
    data_dir = Path(__file__).parent.parent / "data"
    args = sys.argv[1:]

    # scrape --help / -h / help
    if args and args[0] in ("--help", "-h", "help"):
        print(USAGE)
        return

    # scrape diff <catalog|history>
    if len(args) >= 2 and args[0] == "diff":
        _cmd_diff(data_dir, args[1])
        return

    # scrape recover <catalog|history>
    if len(args) >= 2 and args[0] == "recover":
        _cmd_recover(data_dir, args[1])
        return

    # scrape monthly-new [yymm] — monthly new-product pages + snapshot changelog
    if len(args) >= 1 and args[0] == "monthly-new":
        yymm = args[1] if len(args) > 1 else None
        label = yymm or "current + next 3 months"
        print(f"Scraping monthly new-product pages ({label})...")
        items = asyncio.run(scrape_monthly_new(yymm))
        print(f"Found {len(items)} new-product items")

        _backup(data_dir, "monthly_new.json")
        output_path = data_dir / "monthly_new.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")

        # Order matters: diff + retirement tracker BEFORE save_snapshot overwrites
        diff = changelog_mod.diff_snapshot(items, "monthly_new")
        confirmed = changelog_mod.update_retirement_tracker(items, diff)
        report = changelog_mod.format_changelog(diff, confirmed)
        print(report)
        changelog_path = data_dir / "changelog.md"
        changelog_path.write_text(report)
        print(f"Changelog saved to {changelog_path}")
        changelog_mod.save_snapshot(items, "monthly_new")
        print("Done!")
        return

    # scrape changelog — re-print the last generated changelog (no re-scrape)
    if len(args) >= 1 and args[0] == "changelog":
        changelog_path = data_dir / "changelog.md"
        if changelog_path.exists():
            print(changelog_path.read_text())
        else:
            print("No changelog found — run 'scrape monthly-new' first.")
        return

    # scrape fandom-sync [--init] [--no-images] — incremental Fandom sync
    if len(args) >= 1 and args[0] == "fandom-sync":
        import os
        if "--init" in args:
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            save_sync_state(ts)
            print(f"Initialized sync state ({ts}) at {SYNC_STATE_FILE}")
            return

        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_key:
            print("Error: SUPABASE_SERVICE_ROLE_KEY env var required")
            sys.exit(1)

        fetch_images = "--no-images" not in args
        try:
            result = fandom_sync(service_key, supabase_url, fetch_images=fetch_images)
        except SyncStateMissing as e:
            print(e)
            print("First run: use 'scrape fandom' for a full scrape, then 'scrape fandom-sync --init'")
            sys.exit(1)
        print(
            f"Done! changed_pages={result['changed_pages']}, inserted={result['inserted']}, "
            f"failed={result['failed']}, state_updated={result['state_updated']}"
        )
        return

    # scrape tomy-cn — official China site (zh-CN names)
    if len(args) >= 1 and args[0] == "tomy-cn":
        print("Scraping Tomica from tomy.cn (zh-CN names)...")
        items = asyncio.run(scrape_tomy_cn())
        print(f"Found {len(items)} tomy.cn items")
        _backup(data_dir, "tomy_cn.json")
        output_path = data_dir / "tomy_cn.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
        return

    # scrape tomicars-club — MANUAL-RUN ONLY (data license unconfirmed, never schedule)
    if len(args) >= 1 and args[0] == "tomicars-club":
        items = asyncio.run(scrape_tomicars_club())
        print(f"Found {len(items)} tomicars.club releases")
        _backup(data_dir, "tomicars_club.json")
        output_path = data_dir / "tomicars_club.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")
        print("Done!")
        return

    # scrape analyze-feedback [--apply] [--min-count N] — recognition_log → correction_hints
    if len(args) >= 1 and args[0] == "analyze-feedback":
        analyze_feedback_run(args[1:])
        return

    # scrape import-snapshots — import committed data/snapshots/**/*.json into Supabase
    if len(args) >= 1 and args[0] == "import-snapshots":
        import os
        import httpx as httpx_sync

        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_key:
            print("Error: SUPABASE_SERVICE_ROLE_KEY env var required")
            sys.exit(1)

        snapshot_root = Path(__file__).parent.parent.parent / "data" / "snapshots"
        if not snapshot_root.exists():
            print(f"No snapshots directory at {snapshot_root}")
            return

        candidates: list[dict] = []
        for path in sorted(snapshot_root.rglob("*.json")):
            if path.name.startswith("_"):  # e.g. _pending_retirement.json
                continue
            try:
                data = json.loads(path.read_text())
            except ValueError:
                print(f"  skip (invalid JSON): {path}")
                continue
            if not isinstance(data, list):
                continue
            count = 0
            for raw in data:
                if not isinstance(raw, dict):
                    continue
                if not raw.get("car_name") or not raw.get("series"):
                    continue
                row = {k: v for k, v in raw.items() if k in CATALOG_COLUMNS and v is not None}
                row.setdefault("model_number", "")
                row.setdefault("body_color", [])
                row.setdefault("metadata", {})
                # release_date is a DATE column — drop non-ISO values (e.g. "2024年4月")
                rd = row.get("release_date")
                if rd and not ISO_DATE_RE.match(str(rd)):
                    row.pop("release_date")
                candidates.append(row)
                count += 1
            print(f"  {path.relative_to(snapshot_root)}: {count} items")

        if not candidates:
            print("No snapshot items found.")
            return

        # Dedup against existing DB rows (tomica_catalog has no unique
        # constraint, so a naive POST would duplicate the whole catalog).
        headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        base = f"{supabase_url}/rest/v1"
        existing: set[tuple] = set()
        offset = 0
        while True:
            resp = httpx_sync.get(
                f"{base}/tomica_catalog?select=series,model_number,car_name&offset={offset}&limit=1000",
                headers=headers, timeout=30,
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            for r in batch:
                existing.add((r.get("series"), r.get("model_number") or "", r.get("car_name")))
            offset += len(batch)
            if len(batch) < 1000:
                break
        print(f"DB has {len(existing)} existing (series, model_number, car_name) keys")

        seen = set(existing)
        new_rows: list[dict] = []
        for row in candidates:
            key = (row.get("series"), row.get("model_number") or "", row.get("car_name"))
            if key in seen:
                continue
            seen.add(key)
            new_rows.append(row)

        print(f"{len(candidates)} snapshot items → {len(new_rows)} new rows to insert")
        if not new_rows:
            print("Nothing to import — DB already up to date.")
            return
        result = fandom_import_to_supabase(new_rows, service_key, supabase_url)
        print(f"Done! inserted={result['inserted']}, failed={result['failed']}")
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

    # scrape extract-colors — pixel-based color extraction from images (no AI)
    if len(args) >= 1 and args[0] == "extract-colors":
        import os
        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        anon_key = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodnRpcGZteGZkbHBvbGNrdWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjQzNjgsImV4cCI6MjA5MTU0MDM2OH0.MJPwUw6ABTthWKRzmQB8Enh0BF1UMbdJUaKhpHIZ_c0")
        api_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or anon_key

        import httpx as httpx_sync
        headers = {"apikey": api_key, "Authorization": f"Bearer {api_key}"}
        base = f"{supabase_url}/rest/v1"

        # Fetch items with images where color is unknown or missing
        print("Fetching items with images needing color extraction...")
        all_items: list[dict] = []
        offset = 0
        while True:
            resp = httpx_sync.get(
                f"{base}/tomica_catalog?image_url=not.is.null"
                f"&select=id,model_number,car_name,image_url,attributes"
                f"&order=model_number&offset={offset}&limit=1000",
                headers=headers, timeout=30,
            )
            batch = resp.json()
            if not batch:
                break
            # Filter: no attributes, or primary_color is "unknown"
            for item in batch:
                attrs = item.get("attributes")
                if not attrs or attrs.get("primary_color") == "unknown":
                    all_items.append(item)
            offset += len(batch)
            if len(batch) < 1000:
                break

        print(f"Found {len(all_items)} items needing color extraction")
        if not all_items:
            print("All items already have colors!")
            return

        # Extract colors from images (no AI, uses Pillow)
        results = asyncio.run(extract_colors_batch(all_items, concurrency=20))
        print(f"Extracted colors for {len(results)} / {len(all_items)} items")

        # Generate SQL to update attributes with new colors
        sql_lines = []
        for item_id, color_data in results.items():
            # Find original item to merge attributes
            orig = next((i for i in all_items if i["id"] == item_id), None)
            if not orig:
                continue
            attrs = orig.get("attributes") or {}
            attrs["primary_color"] = color_data["primary_color"]
            attrs["secondary_color"] = color_data["secondary_color"]
            attrs_json = json.dumps(attrs).replace("'", "''")
            sql_lines.append(f"UPDATE tomica_catalog SET attributes = '{attrs_json}'::jsonb WHERE id = '{item_id}';")

        output_path = data_dir / "color_updates.sql"
        output_path.write_text("\n".join(sql_lines))
        print(f"SQL saved: {len(sql_lines)} statements → {output_path}")

        # Show color distribution
        from collections import Counter
        color_dist = Counter(r["primary_color"] for r in results.values())
        print("\nColor distribution:")
        for color, count in color_dist.most_common(15):
            print(f"  {color:12s} {count:>4d} {'█' * min(count // 2, 40)}")

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
    elif len(args) >= 1 and args[0] == "fix-dupes":
        """Fix variants of the same model_number that share an identical image_url.

        Strategy:
          1. Query DB for groups where multiple variants share the same image_url.
          2. Re-search Bing with year-specific queries to find distinct images.
          3. Update DB for variants where a different image was found.
          4. NULL-out any variants that still share a URL after searching (so they
             can be re-searched later or filled by another source).
        """
        import os
        import logging
        logging.basicConfig(level=logging.INFO, format="%(message)s")

        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
        anon_key = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodnRpcGZteGZkbHBvbGNrdWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjQzNjgsImV4cCI6MjA5MTU0MDM2OH0.MJPwUw6ABTthWKRzmQB8Enh0BF1UMbdJUaKhpHIZ_c0")
        db_key = supabase_key or anon_key
        headers = {"apikey": db_key, "Authorization": f"Bearer {db_key}", "Content-Type": "application/json"}
        base = f"{supabase_url}/rest/v1"

        import httpx as httpx_sync
        from playwright.async_api import async_playwright
        from .image_search import search_one_image_playwright, _score_url

        # Step 1: Fetch all variants that have an image_url and a variant number
        print("Fetching catalog items with images...")
        all_items: list[dict] = []
        offset = 0
        while True:
            resp = httpx_sync.get(
                f"{base}/tomica_catalog?image_url=not.is.null&variant=not.is.null"
                f"&select=id,model_number,car_name,variant,image_url,release_start"
                f"&order=model_number,variant&offset={offset}&limit=1000",
                headers=headers, timeout=30,
            )
            batch = resp.json()
            if not batch:
                break
            all_items.extend(batch)
            offset += len(batch)
            if len(batch) < 1000:
                break
        print(f"Fetched {len(all_items)} items")

        # Step 2: Identify groups sharing the same (model_number, image_url)
        from collections import defaultdict
        groups: dict[tuple, list[dict]] = defaultdict(list)
        for item in all_items:
            key = (item["model_number"], item["image_url"])
            groups[key].append(item)

        # Only keep groups with >1 variant sharing same URL
        dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
        print(f"Found {len(dup_groups)} duplicate image groups across {sum(len(v) for v in dup_groups.values())} variants")

        if not dup_groups:
            print("No duplicate images found!")
            return

        # Flatten to items list, keeping track of their shared URL
        items_to_search: list[dict] = []
        for (model_number, shared_url), variants in dup_groups.items():
            for item in variants:
                items_to_search.append({**item, "_shared_url": shared_url})

        print(f"Will re-search {len(items_to_search)} variants with year-specific queries")

        # Step 3: Re-search with Playwright
        new_images: dict[str, str | None] = {}  # item_id -> new_url or None

        async def _run_search():
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    locale="ja-JP",
                )
                page = await context.new_page()

                for i, item in enumerate(items_to_search):
                    mn = item["model_number"]
                    cn = item["car_name"]
                    v = item.get("variant")
                    shared_url = item["_shared_url"]

                    # Extract year from release_start (e.g. "2006-04" → 2006)
                    year = None
                    if item.get("release_start"):
                        try:
                            year = int(item["release_start"][:4])
                        except (ValueError, TypeError):
                            pass

                    print(f"[{i+1}/{len(items_to_search)}] {mn}-{v} {cn[:25]} ({year or '?'}年)...", end=" ", flush=True)

                    new_url = await search_one_image_playwright(
                        page, mn, v, cn, year=year, exclude_url=shared_url
                    )

                    if new_url and new_url != shared_url:
                        new_images[item["id"]] = new_url
                        print(f"✓ {new_url[:50]}")
                    else:
                        new_images[item["id"]] = None
                        print("✗ no distinct image found")

                    await asyncio.sleep(2)

                await browser.close()

        asyncio.run(_run_search())

        # Step 4: Identify variants that still have no distinct image
        # For each dup group, check if ALL variants got new distinct images
        # If not, NULL out all but the oldest variant (variant with lowest number)
        items_to_update: dict[str, str | None] = {}

        for (model_number, shared_url), variants in dup_groups.items():
            sorted_variants = sorted(variants, key=lambda x: x.get("variant") or 0)
            oldest_id = sorted_variants[0]["id"]

            got_new = [(v, new_images.get(v["id"])) for v in variants]
            fixed = [(v, url) for v, url in got_new if url is not None]
            unfixed = [(v, url) for v, url in got_new if url is None]

            if fixed:
                # Update variants that got new distinct images
                for v, url in fixed:
                    items_to_update[v["id"]] = url

            if unfixed:
                print(f"\n  {model_number}: {len(unfixed)} variants still share same image → NULLing all but oldest (variant {sorted_variants[0].get('variant')})")
                for v, _ in unfixed:
                    if v["id"] != oldest_id:
                        items_to_update[v["id"]] = None  # NULL out duplicates

        # Step 5: Apply updates
        print(f"\nApplying {len(items_to_update)} updates to Supabase...")
        updated = nulled = failed = 0
        write_headers = {**headers, "Prefer": "return=minimal"}
        for item_id, new_url in items_to_update.items():
            try:
                r = httpx_sync.patch(
                    f"{base}/tomica_catalog?id=eq.{item_id}",
                    headers=write_headers,
                    json={"image_url": new_url},
                    timeout=10,
                )
                r.raise_for_status()
                if new_url:
                    updated += 1
                else:
                    nulled += 1
            except Exception as e:
                print(f"  Failed {item_id}: {e}")
                failed += 1

        print(f"\nDone! Updated: {updated} with new images, NULLed: {nulled} duplicates, Failed: {failed}")
        if nulled:
            print(f"  {nulled} variants cleared — run 'scrape find-images' to re-search them")
        return

    elif len(args) >= 1 and args[0] == "fandom":
        import os
        print("Scraping Tomica data from tomica.fandom.com...")
        items = asyncio.run(scrape_fandom())
        print(f"\nTotal unique items: {len(items)}")
        output_path = data_dir / "fandom.json"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
        print(f"Wrote {len(items)} items to {output_path}")

        # Auto-import if service role key is available
        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if service_key:
            print("\nImporting to Supabase...")
            result = fandom_import_to_supabase(items, service_key, supabase_url)
            print(f"Done! inserted={result['inserted']}, failed={result['failed']}")
        else:
            print("\nNo SUPABASE_SERVICE_ROLE_KEY set — run 'scrape fandom-import' to import.")
        print("Done!")

    elif len(args) >= 1 and args[0] == "fandom-images":
        import os
        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_key:
            print("Error: SUPABASE_SERVICE_ROLE_KEY env var required")
            sys.exit(1)
        print("Fetching Fandom wiki images for catalog records...")
        result = fetch_fandom_images(service_key, supabase_url)
        print(f"Done! updated={result['updated']}, not_found={result['not_found']}, failed={result['failed']}")

    elif len(args) >= 1 and args[0] == "fandom-import":
        import os
        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not service_key:
            print("Error: SUPABASE_SERVICE_ROLE_KEY env var required")
            sys.exit(1)

        fandom_path = data_dir / "fandom.json"
        if not fandom_path.exists():
            print("No fandom.json found — run 'scrape fandom' first")
            sys.exit(1)

        items = json.loads(fandom_path.read_text())
        print(f"Importing {len(items)} items from {fandom_path} to Supabase...")
        result = fandom_import_to_supabase(items, service_key, supabase_url)
        print(f"Done! inserted={result['inserted']}, failed={result['failed']}")

    elif len(args) >= 1 and args[0] == "dedup":
        report = dedup_report(data_dir)
        print(report)
        output_path = data_dir / "dedup_report.txt"
        output_path.write_text(report)
        print(f"\nReport saved to {output_path}")
    elif len(args) >= 1 and args[0] == "find-images":
        import os
        import logging
        logging.basicConfig(level=logging.INFO, format="%(message)s")

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            print("Error: GEMINI_API_KEY env var is required")
            sys.exit(1)

        supabase_url = os.environ.get("SUPABASE_URL", "https://qhvtipfmxfdlpolckubb.supabase.co")
        supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
        anon_key = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodnRpcGZteGZkbHBvbGNrdWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjQzNjgsImV4cCI6MjA5MTU0MDM2OH0.MJPwUw6ABTthWKRzmQB8Enh0BF1UMbdJUaKhpHIZ_c0")
        db_key = supabase_key or anon_key
        headers = {"apikey": db_key, "Authorization": f"Bearer {db_key}", "Content-Type": "application/json"}
        base = f"{supabase_url}/rest/v1"

        # Determine batch size
        limit = int(args[1]) if len(args) > 1 else 20
        print(f"Finding images for up to {limit} items with no image...")

        import httpx as httpx_sync
        # Fetch items missing images
        resp = httpx_sync.get(
            f"{base}/tomica_catalog?image_url=is.null&select=id,model_number,car_name,variant&order=model_number&limit={limit}",
            headers=headers, timeout=30,
        )
        items = resp.json()
        print(f"Fetched {len(items)} items needing images")

        if not items:
            print("All items have images!")
            return

        # Run search
        results = asyncio.run(batch_search_images(items, api_key, concurrency=5))
        print(f"\nFound images for {len(results)}/{len(items)} items")

        # Write to DB if service key available
        if supabase_key and results:
            print("Writing to Supabase...")
            write_headers = {**headers, "Prefer": "return=minimal"}
            success = 0
            for item_id, img_url in results.items():
                try:
                    r = httpx_sync.patch(
                        f"{base}/tomica_catalog?id=eq.{item_id}",
                        headers=write_headers,
                        json={"image_url": img_url},
                        timeout=10,
                    )
                    r.raise_for_status()
                    success += 1
                except Exception as e:
                    print(f"  Failed {item_id}: {e}")
            print(f"Updated {success} items in Supabase")
        elif results:
            # Save to file
            output_path = data_dir / "found_images.json"
            output_path.write_text(json.dumps(results, indent=2))
            print(f"Saved to {output_path} (set SUPABASE_SERVICE_ROLE_KEY to write to DB)")
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

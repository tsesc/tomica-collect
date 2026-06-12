"""Snapshot diffing for scraped catalog data.

Snapshots live in <repo root>/data/snapshots/ (git-tracked, unlike
scraper/data/) so each monthly run produces a reviewable git diff.

Workflow per run:
    items = await scrape_monthly_new()
    diff = diff_snapshot(items, "monthly_new")
    confirmed = update_retirement_tracker(items, diff)
    print(format_changelog(diff, confirmed))
    save_snapshot(items, "monthly_new")
"""

import json
from datetime import date
from pathlib import Path

from .dedup import _sort_key, normalize_model_number

# scraper/scraper/changelog.py → repo root /data/snapshots
SNAPSHOT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "snapshots"
PENDING_RETIREMENT_FILE = "_pending_retirement.json"
RETIREMENT_THRESHOLD = 2  # consecutive absences before confirmed retired

# Fields compared for "modified" detection
COMPARE_FIELDS = ("car_name", "release_date", "image_url", "retired")
COMPARE_METADATA_FIELDS = ("price_jpy",)


def item_key(item: dict) -> str:
    """Stable diff key: series + normalized model_number (dedup.py rules).

    Items without a model number (e.g. SP collections) fall back to car_name.
    """
    num = normalize_model_number(item.get("model_number") or "")
    base = num or item.get("car_name", "")
    return f"{item.get('series', '')}:{base}"


def _snapshot_sort_key(item: dict) -> tuple:
    """Numeric-aware ordering so No.2 sorts before No.10."""
    series, _, base = item_key(item).partition(":")
    return (series, _sort_key(base))


def _snapshot_dir(snapshot_dir: Path | str | None) -> Path:
    return Path(snapshot_dir) if snapshot_dir else SNAPSHOT_DIR


def save_snapshot(items: list[dict], name: str, snapshot_dir: Path | str | None = None) -> Path:
    """Write a stable, git-diff-friendly snapshot: sorted items, sorted keys."""
    d = _snapshot_dir(snapshot_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{name}.json"
    data = sorted(items, key=_snapshot_sort_key)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    print(f"Saved snapshot {path} ({len(data)} items)")
    return path


def load_snapshot(name: str, snapshot_dir: Path | str | None = None) -> list[dict]:
    path = _snapshot_dir(snapshot_dir) / f"{name}.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def _index(items: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for item in items:
        index.setdefault(item_key(item), item)
    return index


def _changed_fields(old: dict, new: dict) -> dict[str, dict]:
    changes: dict[str, dict] = {}
    for field in COMPARE_FIELDS:
        if old.get(field) != new.get(field):
            changes[field] = {"old": old.get(field), "new": new.get(field)}
    old_meta = old.get("metadata") or {}
    new_meta = new.get("metadata") or {}
    for field in COMPARE_METADATA_FIELDS:
        if old_meta.get(field) != new_meta.get(field):
            changes[f"metadata.{field}"] = {
                "old": old_meta.get(field),
                "new": new_meta.get(field),
            }
    return changes


def diff_snapshot(
    items: list[dict], name: str, snapshot_dir: Path | str | None = None
) -> dict:
    """Diff current items against the saved snapshot {name}.json.

    Returns {"added": [item], "removed": [item],
             "modified": [{"key", "item", "changes"}]}.
    Missing snapshot → everything counts as added.
    """
    old_index = _index(load_snapshot(name, snapshot_dir))
    new_index = _index(items)

    added = [new_index[k] for k in sorted(new_index.keys() - old_index.keys())]
    removed = [old_index[k] for k in sorted(old_index.keys() - new_index.keys())]

    modified = []
    for key in sorted(old_index.keys() & new_index.keys()):
        changes = _changed_fields(old_index[key], new_index[key])
        if changes:
            modified.append({"key": key, "item": new_index[key], "changes": changes})

    return {"added": added, "removed": removed, "modified": modified}


def update_retirement_tracker(
    current_items: list[dict],
    diff: dict,
    snapshot_dir: Path | str | None = None,
    today: str | None = None,
) -> list[dict]:
    """Track removed items across runs in _pending_retirement.json.

    An item newly absent gets miss_count=1; still absent next run → 2.
    Reappearing items are dropped. Returns items with
    miss_count >= RETIREMENT_THRESHOLD (confirmed retired).
    """
    d = _snapshot_dir(snapshot_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / PENDING_RETIREMENT_FILE
    pending: dict[str, dict] = json.loads(path.read_text()) if path.exists() else {}

    today = today or date.today().isoformat()
    current_keys = {item_key(item) for item in current_items}

    # Update existing pending entries
    for key in list(pending.keys()):
        if key in current_keys:
            del pending[key]  # reappeared
        else:
            pending[key]["miss_count"] += 1
            pending[key]["last_checked"] = today

    # Newly removed this run
    for item in diff.get("removed", []):
        key = item_key(item)
        if key not in pending:
            pending[key] = {
                "item": item,
                "miss_count": 1,
                "first_missed": today,
                "last_checked": today,
            }

    confirmed = []
    for entry in pending.values():
        is_confirmed = entry["miss_count"] >= RETIREMENT_THRESHOLD
        entry["confirmed_retired"] = is_confirmed
        if is_confirmed:
            confirmed.append(entry["item"])

    path.write_text(
        json.dumps(pending, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    return confirmed


def _item_line(item: dict) -> str:
    code = item.get("model_number") or "(no number)"
    name = item.get("car_name", "?")
    series = item.get("series", "?")
    release = item.get("release_date")
    suffix = f", {release[:7]}" if release else ""
    return f"- **{code}** {name} ({series}{suffix})"


def format_changelog(diff: dict, confirmed_retired: list[dict] | None = None) -> str:
    """Human-readable markdown summary for PR bodies / Discord."""
    added = diff.get("added", [])
    removed = diff.get("removed", [])
    modified = diff.get("modified", [])
    confirmed_retired = confirmed_retired or []

    lines = ["## Tomica Catalog Changes", ""]

    if not (added or removed or modified or confirmed_retired):
        lines.append("No changes detected.")
        return "\n".join(lines)

    if added:
        lines.append(f"### Added ({len(added)})")
        lines.extend(_item_line(i) for i in added)
        lines.append("")

    if modified:
        lines.append(f"### Modified ({len(modified)})")
        for entry in modified:
            fields = ", ".join(sorted(entry["changes"].keys()))
            lines.append(f"{_item_line(entry['item'])} — changed: {fields}")
        lines.append("")

    if removed:
        lines.append(f"### Removed ({len(removed)})")
        lines.extend(_item_line(i) for i in removed)
        lines.append("")

    if confirmed_retired:
        lines.append(f"### Confirmed Retired ({len(confirmed_retired)})")
        lines.append("Absent for 2+ consecutive runs — likely discontinued (廃番).")
        lines.extend(_item_line(i) for i in confirmed_retired)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"

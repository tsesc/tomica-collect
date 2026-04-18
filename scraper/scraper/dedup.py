"""Cross-source deduplication for Tomica catalog data.

Unique key: normalized model_number (e.g., "No.72").
Each source may use different names for the same car:
  - takaratomy (JP): "No.72 ジープ ラングラー"
  - funbox (TW):     "No.072 Jeep Wrangler"
  - cochume (JP):    "No.72-6 ジープ ラングラー"

The dedup report shows all sources for each model number so you can
confirm there are no false matches or missing items.
"""

import json
import re
from collections import defaultdict
from pathlib import Path


def normalize_model_number(raw: str) -> str:
    """Normalize model number to canonical form.

    "No.072" → "No.72", "No.7" → "No.7", "TP.01" → "TP.1"
    Strips leading zeros after the dot.
    """
    match = re.match(r"((?:No|TP)\.)(\d+)", raw)
    if not match:
        return raw
    prefix = match.group(1)
    num = int(match.group(2))
    return f"{prefix}{num}"


def _load_json(path: Path) -> list[dict]:
    """Load JSON array from file, return empty list if missing."""
    if not path.exists():
        return []
    return json.loads(path.read_text())


def build_index(data_dir: Path) -> dict[str, list[dict]]:
    """Build a model_number → [items from all sources] index.

    Loads all available data files and groups items by normalized model_number.
    """
    sources = {
        "catalog": ("catalog.json", "official"),
        "history": ("history.json", "community"),
        "funbox": ("funbox.json", "funbox"),
        "dream": ("dream.json", "official"),
        "premium": ("premium.json", "official"),
    }

    index: dict[str, list[dict]] = defaultdict(list)

    for source_name, (filename, _) in sources.items():
        items = _load_json(data_dir / filename)
        for item in items:
            raw_num = item.get("model_number", "")
            if not raw_num:
                continue
            key = normalize_model_number(raw_num)
            index[key].append({
                **item,
                "_source_file": source_name,
                "_normalized_key": key,
            })

    return dict(index)


def dedup_report(data_dir: Path) -> str:
    """Generate a human-readable dedup report.

    Shows:
    1. Summary counts per source
    2. Items present in multiple sources (potential duplicates to verify)
    3. Items unique to only one source (potential gaps)
    """
    index = build_index(data_dir)
    lines: list[str] = []

    # Count per source
    source_counts: dict[str, int] = defaultdict(int)
    multi_source: dict[str, list[dict]] = {}
    single_source: dict[str, list[dict]] = {}

    for key, items in sorted(index.items(), key=lambda x: _sort_key(x[0])):
        sources = {i["_source_file"] for i in items}
        for s in sources:
            source_counts[s] += 1

        if len(sources) > 1:
            multi_source[key] = items
        else:
            single_source[key] = items

    # Header
    lines.append("=" * 70)
    lines.append("TOMICA DEDUP REPORT")
    lines.append("=" * 70)
    lines.append("")
    lines.append(f"Total unique model numbers: {len(index)}")
    lines.append("")
    lines.append("Items per source:")
    for src, count in sorted(source_counts.items()):
        lines.append(f"  {src:12s} {count:>4d} items")

    # Multi-source matches
    lines.append("")
    lines.append("-" * 70)
    lines.append(f"CROSS-SOURCE MATCHES ({len(multi_source)} model numbers)")
    lines.append("-" * 70)
    for key, items in sorted(multi_source.items(), key=lambda x: _sort_key(x[0])):
        lines.append(f"\n  {key}:")
        for item in items:
            src = item["_source_file"]
            name = item.get("car_name", "?")
            variant = item.get("variant", "")
            suffix = f" (variant {variant})" if variant else ""
            lines.append(f"    [{src:8s}] {name}{suffix}")

    # Single-source items
    lines.append("")
    lines.append("-" * 70)
    lines.append(f"SINGLE-SOURCE ITEMS ({len(single_source)} model numbers)")
    lines.append("-" * 70)

    by_source: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for key, items in single_source.items():
        src = items[0]["_source_file"]
        name = items[0].get("car_name", "?")
        by_source[src].append((key, name))

    for src, entries in sorted(by_source.items()):
        lines.append(f"\n  Only in {src} ({len(entries)}):")
        for key, name in sorted(entries, key=lambda x: _sort_key(x[0])):
            lines.append(f"    {key:10s} {name}")

    return "\n".join(lines)


def enrich_catalog(data_dir: Path) -> list[dict]:
    """Fill missing fields in catalog.json using data from other sources.

    Priority for image_url: funbox > history (current variant only).
    Returns list of changes made: [{model_number, field, old, new, source}]
    """
    catalog_path = data_dir / "catalog.json"
    if not catalog_path.exists():
        return []

    catalog = json.loads(catalog_path.read_text())
    index = build_index(data_dir)
    changes: list[dict] = []

    for item in catalog:
        raw_num = item.get("model_number", "")
        key = normalize_model_number(raw_num)
        if key not in index:
            continue

        # Only enrich missing image_url for now
        if item.get("image_url"):
            continue

        # Search other sources for an image, prefer funbox (high-res product photo)
        best_img = None
        best_source = None

        for other in index[key]:
            src = other.get("_source_file", "")
            img = other.get("image_url")
            if not img or src == "catalog":
                continue

            # For history items, only use the current variant (highest variant number)
            if src == "history":
                variant = other.get("variant", 0)
                all_variants = [
                    o.get("variant", 0)
                    for o in index[key]
                    if o.get("_source_file") == "history"
                ]
                if variant != max(all_variants):
                    continue

            if src == "funbox":
                best_img = img
                best_source = src
                break  # funbox is highest priority
            elif best_img is None:
                best_img = img
                best_source = src

        if best_img:
            changes.append({
                "model_number": raw_num,
                "field": "image_url",
                "old": None,
                "new": best_img,
                "source": best_source,
            })
            item["image_url"] = best_img

    if changes:
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2))

    return changes


def _sort_key(model_key: str) -> tuple[str, int]:
    """Sort key for model numbers: prefix then numeric."""
    match = re.match(r"([A-Za-z.]+)(\d+)", model_key)
    if match:
        return (match.group(1), int(match.group(2)))
    return (model_key, 0)

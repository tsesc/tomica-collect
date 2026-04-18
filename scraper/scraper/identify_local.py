"""Local Tomica identification — no AI API needed.

Analyzes a user-provided image using computer vision (OpenCV/Pillow)
to extract visual features (dominant color, shape, size), then matches
against the catalog database using attribute-based scoring.

Usage:
    uv run identify <image_path>
    uv run identify <image_path> --top 10
    uv run identify <image_path> --json
"""

import json
import math
import sys
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image, ImageStat
except ImportError:
    print("Error: Pillow required. Run: uv add pillow")
    sys.exit(1)

import httpx


# === Color Analysis ===

# Map RGB ranges to color names
COLOR_RANGES: list[tuple[str, tuple[int, int, int], float]] = [
    # (name, reference_rgb, max_distance)
    ("red", (200, 30, 30), 80),
    ("red", (180, 0, 0), 70),
    ("blue", (30, 60, 180), 80),
    ("blue", (0, 0, 150), 70),
    ("white", (240, 240, 240), 40),
    ("black", (30, 30, 30), 45),
    ("silver", (170, 170, 175), 40),
    ("gray", (128, 128, 128), 40),
    ("yellow", (220, 200, 30), 70),
    ("gold", (200, 170, 50), 60),
    ("green", (30, 150, 50), 80),
    ("orange", (230, 130, 30), 70),
    ("brown", (140, 90, 50), 60),
    ("pink", (230, 150, 170), 60),
    ("navy", (20, 30, 80), 50),
    ("light blue", (100, 180, 230), 60),
    ("beige", (220, 200, 170), 50),
    ("maroon", (120, 30, 30), 50),
    ("purple", (120, 50, 150), 60),
]


def _color_distance(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> float:
    """Euclidean distance between two RGB colors."""
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))


def extract_dominant_colors(image: Image.Image, n_colors: int = 3) -> list[str]:
    """Extract dominant color names from image using quantization."""
    # Resize for speed
    img = image.copy()
    img.thumbnail((100, 100))
    img = img.convert("RGB")

    # Quantize to get dominant colors
    quantized = img.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette()
    if not palette:
        return ["unknown"]

    # Get color counts
    color_counts = sorted(quantized.getcolors(), key=lambda x: -x[0])

    result_colors = []
    for count, idx in color_counts[:n_colors]:
        r, g, b = palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]

        # Skip near-white backgrounds
        if r > 230 and g > 230 and b > 230:
            continue

        # Find closest named color
        best_name = "unknown"
        best_dist = float("inf")
        for name, ref_rgb, max_dist in COLOR_RANGES:
            dist = _color_distance((r, g, b), ref_rgb)
            if dist < max_dist and dist < best_dist:
                best_name = name
                best_dist = dist

        if best_name not in result_colors:
            result_colors.append(best_name)

    return result_colors if result_colors else ["unknown"]


def estimate_aspect_ratio(image: Image.Image) -> str:
    """Estimate if vehicle is long (truck/bus) or compact (car)."""
    w, h = image.size
    ratio = w / h if h > 0 else 1
    if ratio > 2.5:
        return "extra_long"  # train, trailer
    elif ratio > 1.8:
        return "long"  # bus, truck
    elif ratio > 1.2:
        return "normal"  # sedan, SUV
    else:
        return "compact"  # kei car, motorcycle


def analyze_image(image_path: str) -> dict:
    """Analyze a local image and extract visual features.

    Returns dict compatible with matchCandidates features format.
    """
    img = Image.open(image_path)

    colors = extract_dominant_colors(img)
    aspect = estimate_aspect_ratio(img)

    # Build features dict
    features: dict = {
        "primary_color": colors[0] if colors else "unknown",
        "secondary_color": colors[1] if len(colors) > 1 else None,
        "aspect_ratio": aspect,
    }

    # Rough category guess from aspect ratio
    if aspect == "extra_long":
        features["vehicle_category"] = "train"
        features["size_class"] = "extra_large"
    elif aspect == "long":
        features["size_class"] = "large"
    else:
        features["size_class"] = "medium"

    return features


# === Database Matching ===

def fetch_catalog(supabase_url: str, api_key: str) -> list[dict]:
    """Fetch catalog items with attributes from Supabase."""
    items = []
    offset = 0
    while True:
        resp = httpx.get(
            f"{supabase_url}/rest/v1/tomica_catalog"
            f"?attributes=not.is.null"
            f"&select=id,model_number,car_name,manufacturer,series,image_url,attributes,variant"
            f"&order=model_number&offset={offset}&limit=1000",
            headers={"apikey": api_key, "Authorization": f"Bearer {api_key}"},
            timeout=30,
        )
        batch = resp.json()
        if not batch:
            break
        items.extend(batch)
        offset += len(batch)
        if len(batch) < 1000:
            break
    return items


def score_match(features: dict, item: dict) -> tuple[float, list[str]]:
    """Score how well extracted features match a catalog item."""
    attrs = item.get("attributes")
    if not attrs:
        return 0.0, []

    score = 0.0
    reasons = []

    # Color match (0.35 — most reliable from image)
    f_color = (features.get("primary_color") or "").lower()
    i_color = (attrs.get("primary_color") or "").lower()
    i_color2 = (attrs.get("secondary_color") or "").lower()

    if f_color and f_color != "unknown":
        if f_color == i_color:
            score += 0.35
            reasons.append(f"Primary color: {i_color}")
        elif f_color == i_color2:
            score += 0.20
            reasons.append(f"Secondary color: {i_color2}")
        elif i_color in f_color or f_color in i_color:
            score += 0.15
            reasons.append(f"Color partial: {i_color}")

    # Secondary color match (0.15)
    f_color2 = (features.get("secondary_color") or "").lower()
    if f_color2 and f_color2 != "unknown":
        if f_color2 == i_color2:
            score += 0.15
            reasons.append(f"2nd color: {i_color2}")
        elif f_color2 == i_color:
            score += 0.10
            reasons.append(f"2nd matches primary: {i_color}")

    # Size/aspect match (0.15)
    f_size = features.get("size_class", "")
    i_size = attrs.get("size_class", "")
    if f_size and i_size and f_size == i_size:
        score += 0.15
        reasons.append(f"Size: {i_size}")

    # Vehicle category match (0.20)
    f_cat = features.get("vehicle_category", "")
    i_cat = attrs.get("vehicle_category", "")
    if f_cat and i_cat and f_cat == i_cat:
        score += 0.20
        reasons.append(f"Category: {i_cat}")

    # Manufacturer match (0.15) — if user provides text hint
    f_mfr = (features.get("manufacturer") or "").lower()
    i_mfr = (item.get("manufacturer") or "").lower()
    if f_mfr and i_mfr and (f_mfr in i_mfr or i_mfr in f_mfr):
        score += 0.15
        reasons.append(f"Manufacturer: {item.get('manufacturer')}")

    return score, reasons


def identify(
    image_path: str,
    supabase_url: str = "https://qhvtipfmxfdlpolckubb.supabase.co",
    api_key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFodnRpcGZteGZkbHBvbGNrdWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjQzNjgsImV4cCI6MjA5MTU0MDM2OH0.MJPwUw6ABTthWKRzmQB8Enh0BF1UMbdJUaKhpHIZ_c0",
    top_n: int = 5,
    hints: dict | None = None,
) -> list[dict]:
    """Identify a Tomica from a photo using local image analysis + DB matching.

    Args:
        image_path: Path to the image file
        top_n: Number of top candidates to return
        hints: Optional dict with user-provided hints (manufacturer, vehicle_type, etc.)

    Returns:
        List of {item, score, reasons} dicts, sorted by score descending.
    """
    # Extract features from image
    features = analyze_image(image_path)

    # Merge user hints
    if hints:
        features.update(hints)

    print(f"Extracted features: {json.dumps(features, indent=2)}")

    # Fetch catalog
    print("Fetching catalog...")
    catalog = fetch_catalog(supabase_url, api_key)
    print(f"Catalog: {len(catalog)} items with attributes")

    # Score all items
    results = []
    for item in catalog:
        score, reasons = score_match(features, item)
        if score > 0.1:
            results.append({
                "model_number": item.get("model_number"),
                "car_name": item.get("car_name"),
                "manufacturer": item.get("manufacturer"),
                "series": item.get("series"),
                "score": round(score, 3),
                "reasons": reasons,
                "image_url": item.get("image_url"),
            })

    results.sort(key=lambda x: -x["score"])
    return results[:top_n]


def main():
    """CLI entry point for local identification."""
    args = sys.argv[1:]
    if not args:
        print("Usage: uv run identify <image_path> [--top N] [--json] [--hint key=value]")
        print("\nExamples:")
        print("  uv run identify photo.jpg")
        print("  uv run identify photo.jpg --top 10")
        print("  uv run identify photo.jpg --hint manufacturer=Toyota")
        print("  uv run identify photo.jpg --hint vehicle_category=emergency --hint primary_color=white")
        sys.exit(1)

    image_path = args[0]
    if not Path(image_path).exists():
        print(f"Error: File not found: {image_path}")
        sys.exit(1)

    top_n = 5
    output_json = False
    hints: dict = {}

    i = 1
    while i < len(args):
        if args[i] == "--top" and i + 1 < len(args):
            top_n = int(args[i + 1])
            i += 2
        elif args[i] == "--json":
            output_json = True
            i += 1
        elif args[i] == "--hint" and i + 1 < len(args):
            key, _, value = args[i + 1].partition("=")
            hints[key] = value
            i += 2
        else:
            i += 1

    print(f"Analyzing: {image_path}")
    results = identify(image_path, top_n=top_n, hints=hints if hints else None)

    if output_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print(f"\nTop {len(results)} matches:")
        print("-" * 70)
        for i, r in enumerate(results, 1):
            print(f"  {i}. [{r['score']:.0%}] {r['model_number']} — {r['car_name']}")
            print(f"     {r['manufacturer'] or '?'} | {r['series']}")
            print(f"     Reasons: {', '.join(r['reasons'])}")
            print()

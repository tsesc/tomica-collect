"""Extract dominant colors from catalog images using Pillow — no AI needed.

Downloads each item's image, quantizes to find dominant colors,
maps RGB values to named colors, updates attributes.

Usage: uv run scrape extract-colors
"""

import asyncio
import math
import logging
from io import BytesIO

import httpx
from PIL import Image

logger = logging.getLogger(__name__)

# Named color references: (name, R, G, B)
COLOR_REFS: list[tuple[str, int, int, int]] = [
    ("red", 200, 30, 30),
    ("red", 180, 0, 0),
    ("red", 220, 50, 50),
    ("dark red", 139, 0, 0),
    ("blue", 30, 60, 200),
    ("blue", 0, 50, 180),
    ("blue", 50, 100, 220),
    ("light blue", 100, 180, 230),
    ("navy", 20, 30, 100),
    ("white", 245, 245, 245),
    ("white", 230, 230, 230),
    ("black", 25, 25, 25),
    ("black", 40, 40, 40),
    ("silver", 180, 180, 185),
    ("silver", 160, 160, 165),
    ("gray", 120, 120, 120),
    ("gray", 100, 100, 100),
    ("yellow", 230, 210, 30),
    ("yellow", 240, 220, 50),
    ("gold", 200, 170, 50),
    ("gold", 180, 150, 40),
    ("green", 30, 150, 50),
    ("green", 50, 130, 60),
    ("green", 0, 100, 0),
    ("orange", 230, 130, 30),
    ("orange", 240, 160, 50),
    ("brown", 140, 90, 50),
    ("brown", 120, 70, 40),
    ("beige", 220, 200, 170),
    ("beige", 210, 190, 160),
    ("pink", 230, 150, 170),
    ("pink", 240, 130, 150),
    ("purple", 120, 50, 150),
    ("maroon", 120, 30, 30),
    ("cream", 255, 253, 208),
    ("copper", 184, 115, 51),
    ("chrome", 200, 200, 210),
]

# Background colors to skip (white/light gray backgrounds common in product photos)
BG_THRESHOLD = 220  # RGB all above this = background


def _color_dist(r1: int, g1: int, b1: int, r2: int, g2: int, b2: int) -> float:
    """Weighted Euclidean distance — human eye is more sensitive to green."""
    return math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2)


def _rgb_to_name(r: int, g: int, b: int) -> tuple[str, float]:
    """Map RGB to nearest named color. Returns (name, distance)."""
    best_name = "unknown"
    best_dist = float("inf")
    for name, cr, cg, cb in COLOR_REFS:
        dist = _color_dist(r, g, b, cr, cg, cb)
        if dist < best_dist:
            best_name = name
            best_dist = dist
    return best_name, best_dist


def extract_colors(img_bytes: bytes, n_colors: int = 5) -> list[tuple[str, float]]:
    """Extract dominant color names from image bytes.

    Strategy: crop to center 60% of image (where the car body is),
    excluding background edges. Then quantize and map to named colors.
    Filters out background whites/grays/silvers aggressively.
    """
    img = Image.open(BytesIO(img_bytes))
    img = img.convert("RGB")

    # Crop to center 60% — car body is usually centered, background at edges
    w, h = img.size
    margin_x = int(w * 0.2)
    margin_y = int(h * 0.2)
    img = img.crop((margin_x, margin_y, w - margin_x, h - margin_y))

    # Resize for speed
    img.thumbnail((120, 120))

    # Quantize
    quantized = img.quantize(colors=n_colors * 3, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette()
    if not palette:
        return [("unknown", 1.0)]

    colors = quantized.getcolors()
    if not colors:
        return [("unknown", 1.0)]

    total_pixels = sum(count for count, _ in colors)
    color_counts = sorted(colors, key=lambda x: -x[0])

    # Map to named colors, aggressively skip neutral backgrounds
    named: dict[str, float] = {}
    for count, idx in color_counts:
        r, g, b = palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]

        # Skip near-white background
        if r > BG_THRESHOLD and g > BG_THRESHOLD and b > BG_THRESHOLD:
            continue
        # Skip near-black (shadow/outline)
        if r < 20 and g < 20 and b < 20:
            continue
        # Skip neutral grays (likely background, not car body)
        # A real colored object has some channel significantly different from others
        max_ch = max(r, g, b)
        min_ch = min(r, g, b)
        saturation = (max_ch - min_ch) / max(max_ch, 1)
        is_neutral = saturation < 0.15 and 50 < r < 200

        name, dist = _rgb_to_name(r, g, b)
        if dist > 180:
            continue

        proportion = count / total_pixels

        # Demote neutral colors (gray/silver/chrome) — they're likely background
        if is_neutral and name in ("gray", "silver", "chrome"):
            proportion *= 0.3  # Heavy penalty

        if name in named:
            named[name] += proportion
        else:
            named[name] = proportion

    if not named:
        return [("unknown", 1.0)]

    result = sorted(named.items(), key=lambda x: -x[1])
    return result[:n_colors]


async def extract_colors_batch(
    items: list[dict],
    concurrency: int = 20,
) -> dict[str, dict]:
    """Download images and extract colors for a batch of items.

    Returns {item_id: {"primary_color": str, "secondary_color": str|None}}
    """
    sem = asyncio.Semaphore(concurrency)
    results: dict[str, dict] = {}

    async def process(client: httpx.AsyncClient, item: dict) -> None:
        item_id = item["id"]
        image_url = item.get("image_url")
        if not image_url:
            return

        async with sem:
            try:
                resp = await client.get(image_url, timeout=15)
                if resp.status_code != 200:
                    return
                colors = extract_colors(resp.content)
                if not colors or colors[0][0] == "unknown":
                    return

                primary = colors[0][0]
                secondary = colors[1][0] if len(colors) > 1 and colors[1][1] > 0.05 else None
                # Don't set secondary if same as primary
                if secondary == primary:
                    secondary = colors[2][0] if len(colors) > 2 and colors[2][1] > 0.05 else None

                results[item_id] = {
                    "primary_color": primary,
                    "secondary_color": secondary,
                }
            except Exception as e:
                logger.debug("Failed %s: %s", item.get("model_number"), e)

    async with httpx.AsyncClient(
        headers={"User-Agent": "TomicaCollect-Scraper/1.0"},
        follow_redirects=True,
    ) as client:
        tasks = [process(client, item) for item in items]
        await asyncio.gather(*tasks)

    return results

"""Batch attribute extraction via Gemini Flash Vision API.

Analyzes Tomica product images to extract 12 structured vehicle attributes
(category, body style, colors, features, etc.) using Gemini's vision model.
"""

import asyncio
import base64
import json
import logging

import httpx

logger = logging.getLogger(__name__)

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-2.5-flash:generateContent?key={api_key}"
)

PROMPT = """\
You are a Tomica die-cast car expert. Analyze this product image and extract \
vehicle attributes as a JSON object with exactly these fields:

- vehicle_category: one of [car, truck, bus, emergency, construction, motorcycle, aircraft, boat, train, fantasy]
- body_style: one of [sedan, suv, coupe, wagon, van, pickup, convertible, hatchback, cab_over, special]
- primary_color: lowercase color name (e.g. "red", "blue", "white")
- secondary_color: lowercase color name or null if single-color
- wheel_count: one of [0, 2, 4, 6, 8]
- size_class: one of [small, medium, large, extra_large]
- features: array of applicable items from [police_light, ladder, wing, blade, crane, antenna, decal, open_top, tank, trailer]
- era_style: one of [classic, modern, futuristic, retro]
- has_livery: true if the vehicle has branded livery/graphics, false otherwise
- window_style: one of [standard, none, panoramic, cab]

Return ONLY the JSON object, no explanation.\
"""

# Validation sets for enum fields
VALID_VEHICLE_CATEGORY = {
    "car", "truck", "bus", "emergency", "construction",
    "motorcycle", "aircraft", "boat", "train", "fantasy",
}
VALID_BODY_STYLE = {
    "sedan", "suv", "coupe", "wagon", "van", "pickup",
    "convertible", "hatchback", "cab_over", "special",
}
VALID_WHEEL_COUNT = {0, 2, 4, 6, 8}
VALID_SIZE_CLASS = {"small", "medium", "large", "extra_large"}
VALID_FEATURES = {
    "police_light", "ladder", "wing", "blade", "crane",
    "antenna", "decal", "open_top", "tank", "trailer",
}
VALID_ERA_STYLE = {"classic", "modern", "futuristic", "retro"}
VALID_WINDOW_STYLE = {"standard", "none", "panoramic", "cab"}


def validate_attributes(data: dict) -> dict | None:
    """Validate and normalize AI response into clean attributes dict.

    Returns normalized dict on success, None if validation fails.
    """
    try:
        result = {}

        # vehicle_category
        vc = str(data.get("vehicle_category", "")).lower().strip()
        if vc not in VALID_VEHICLE_CATEGORY:
            logger.warning("Invalid vehicle_category: %s", vc)
            return None
        result["vehicle_category"] = vc

        # body_style
        bs = str(data.get("body_style", "")).lower().strip()
        if bs not in VALID_BODY_STYLE:
            logger.warning("Invalid body_style: %s", bs)
            return None
        result["body_style"] = bs

        # primary_color (required, free-form string)
        pc = data.get("primary_color")
        if not pc or not isinstance(pc, str) or not pc.strip():
            logger.warning("Missing primary_color")
            return None
        result["primary_color"] = pc.lower().strip()

        # secondary_color (nullable)
        sc = data.get("secondary_color")
        if sc is not None and isinstance(sc, str) and sc.strip():
            result["secondary_color"] = sc.lower().strip()
        else:
            result["secondary_color"] = None

        # wheel_count
        wc = data.get("wheel_count")
        try:
            wc = int(wc)
        except (TypeError, ValueError):
            logger.warning("Invalid wheel_count: %s", wc)
            return None
        if wc not in VALID_WHEEL_COUNT:
            logger.warning("Invalid wheel_count: %d", wc)
            return None
        result["wheel_count"] = wc

        # size_class
        sc_val = str(data.get("size_class", "")).lower().strip()
        if sc_val not in VALID_SIZE_CLASS:
            logger.warning("Invalid size_class: %s", sc_val)
            return None
        result["size_class"] = sc_val

        # features (array of valid feature strings)
        features_raw = data.get("features", [])
        if not isinstance(features_raw, list):
            features_raw = []
        result["features"] = [
            f for f in features_raw
            if isinstance(f, str) and f.lower().strip() in VALID_FEATURES
        ]
        # Normalize to lowercase
        result["features"] = [f.lower().strip() for f in result["features"]]

        # era_style
        es = str(data.get("era_style", "")).lower().strip()
        if es not in VALID_ERA_STYLE:
            logger.warning("Invalid era_style: %s", es)
            return None
        result["era_style"] = es

        # has_livery
        hl = data.get("has_livery")
        if isinstance(hl, bool):
            result["has_livery"] = hl
        elif isinstance(hl, str):
            result["has_livery"] = hl.lower().strip() in ("true", "1", "yes")
        else:
            result["has_livery"] = bool(hl)

        # window_style
        ws = str(data.get("window_style", "")).lower().strip()
        if ws not in VALID_WINDOW_STYLE:
            logger.warning("Invalid window_style: %s", ws)
            return None
        result["window_style"] = ws

        return result

    except Exception:
        logger.exception("Unexpected error validating attributes")
        return None


async def analyze_image(
    client: httpx.AsyncClient,
    api_key: str,
    image_url: str,
) -> dict | None:
    """Fetch image, send to Gemini Flash, validate and return attributes.

    Returns validated attributes dict or None on failure.
    """
    # Fetch image bytes
    try:
        img_resp = await client.get(image_url, timeout=30.0)
        img_resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("Failed to fetch image %s: %s", image_url, e)
        return None

    content_type = img_resp.headers.get("content-type", "image/jpeg")
    # Normalize mime type
    if "png" in content_type:
        mime = "image/png"
    elif "webp" in content_type:
        mime = "image/webp"
    elif "gif" in content_type:
        mime = "image/gif"
    else:
        mime = "image/jpeg"

    img_b64 = base64.b64encode(img_resp.content).decode()

    # Call Gemini Flash
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime,
                            "data": img_b64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
        },
    }

    url = GEMINI_API_URL.format(api_key=api_key)
    try:
        resp = await client.post(url, json=payload, timeout=60.0)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.warning("Gemini API error: %s", e)
        return None

    # Parse response
    try:
        body = resp.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logger.warning("Failed to parse Gemini response: %s", e)
        return None

    return validate_attributes(data)


async def enrich_batch(
    items: list[dict],
    api_key: str,
    concurrency: int = 10,
) -> dict:
    """Process a batch of catalog items through Gemini Flash.

    Args:
        items: List of dicts with at least 'id', 'model_number', 'car_name', 'image_url'.
        api_key: Gemini API key.
        concurrency: Max concurrent requests (default 10).

    Returns:
        Dict mapping item id to validated attributes dict.
        Items that failed are omitted.
    """
    results: dict = {}
    sem = asyncio.Semaphore(concurrency)

    async def _process(client: httpx.AsyncClient, item: dict) -> None:
        item_id = item["id"]
        image_url = item["image_url"]
        label = f"{item.get('model_number', '?')} {item.get('car_name', '?')}"

        async with sem:
            attrs = await analyze_image(client, api_key, image_url)

            # Retry once on failure
            if attrs is None:
                logger.info("Retrying %s ...", label)
                await asyncio.sleep(1)
                attrs = await analyze_image(client, api_key, image_url)

            if attrs is not None:
                results[item_id] = attrs
                logger.info("OK  %s", label)
            else:
                logger.warning("FAIL %s", label)

    async with httpx.AsyncClient() as client:
        tasks = [_process(client, item) for item in items]
        await asyncio.gather(*tasks)

    return results

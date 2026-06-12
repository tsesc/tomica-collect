"""Parse the Tomica release archive embedded in tomicars.club/archive.

!! DATA LICENSE UNCONFIRMED !!
tomicars.club has not granted permission for data reuse (its Directus API
at cms.tomicars.club/items/releases returns 403 — the data is intentionally
not public). Contact the site owner BEFORE importing this data into the
shared catalog. This source is MANUAL-RUN ONLY — never schedule it.

The archive page is Next.js App Router: data lives in
<script>self.__next_f.push([1,"..."])</script> React Flight chunks (no
__NEXT_DATA__). Chunks are concatenated in document order; the combined
payload contains a "releases":[...] JSON array. Image UUIDs resolve to
https://cms.tomicars.club/assets/{uuid}. This is a Next.js-internal format
with no stability guarantee — expect breakage on site upgrades.
"""

import json
import re

import httpx

ARCHIVE_URL = "https://tomicars.club/archive"
ASSET_BASE = "https://cms.tomicars.club/assets"
HEADERS = {"User-Agent": "TomicaCollect-Scraper/1.0 (personal project)"}

LICENSE_WARNING = (
    "WARNING: tomicars.club data license is UNCONFIRMED. Contact the site\n"
    "owner before importing into the shared catalog. Manual runs only —\n"
    "do NOT schedule this scraper."
)

# Matches the JS string literal inside self.__next_f.push([1,"..."]),
# handling escaped characters so we don't stop at an escaped quote.
_FLIGHT_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', re.DOTALL)

_ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})|\\(.)", re.DOTALL)
_SIMPLE_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f"}


def _js_unescape(s: str) -> str:
    """Unescape a JS double-quoted string body without mojibaking UTF-8.

    Handles \\uXXXX and simple backslash escapes; leaves raw UTF-8 intact
    (avoids the latin-1/unicode_escape trick which corrupts Japanese).
    """
    def repl(m: re.Match) -> str:
        if m.group(1):
            return chr(int(m.group(1), 16))
        c = m.group(2)
        return _SIMPLE_ESCAPES.get(c, c)

    return _ESCAPE_RE.sub(repl, s)


def extract_flight_payload(html: str) -> str:
    """Concatenate all React Flight push chunks (unescaped, document order)."""
    chunks = _FLIGHT_RE.findall(html)
    if not chunks:
        raise ValueError("No self.__next_f.push chunks found — page format changed?")
    # Each chunk is a complete JS string literal, so unescape per-chunk then join
    # (a chunk boundary may fall mid-JSON but never mid-escape-sequence).
    return "".join(_js_unescape(c) for c in chunks)


def _extract_balanced_array(text: str, start: int) -> str:
    """Return the JSON array starting at text[start] == '[', bracket-balanced."""
    depth = 0
    in_str = False
    escaped = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if escaped:
                escaped = False
            elif c == "\\":
                escaped = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]
    raise ValueError("Unbalanced JSON array in flight payload")


def extract_releases(html: str) -> list[dict]:
    """Extract the raw releases array from the archive page HTML."""
    payload = extract_flight_payload(html)
    marker = '"releases":['
    idx = payload.find(marker)
    if idx == -1:
        raise ValueError('"releases":[ not found in flight payload — page format changed?')
    array_text = _extract_balanced_array(payload, idx + len(marker) - 1)
    return json.loads(array_text)


def parse_release(release: dict) -> dict:
    """Map a tomicars.club release record to history.py field semantics."""
    branch = release.get("branch") or ""
    variant = None
    branch_match = re.fullmatch(r"(\d+)-(\d+)", branch)
    if branch_match:
        variant = int(branch_match.group(2))

    tomica_no = release.get("tomica_no")
    image = release.get("image")
    series = release.get("series_id") or {}
    manufacturer = release.get("manufacturer_id") or {}
    vehicle_type = release.get("vehicle_type_id") or {}

    return {
        "model_number": f"No.{tomica_no}" if tomica_no is not None else None,
        "variant": variant,
        "car_name": release.get("name_jp"),
        "car_name_en": release.get("name_en"),
        "series": "regular",
        "is_first_edition": False,
        "source": "community",
        "release_start": release.get("release_start"),
        "release_end": release.get("release_end"),
        "image_url": f"{ASSET_BASE}/{image}" if image else None,
        "manufacturer": manufacturer.get("name"),
        "metadata": {
            "tomicars_release_id": release.get("release_id"),
            "tomicars_series": series.get("name_en"),
            "vehicle_type": vehicle_type.get("name"),
            "license": "UNCONFIRMED — contact tomicars.club before import",
        },
    }


async def scrape_tomicars_club() -> list[dict]:
    """Fetch and parse the tomicars.club archive. MANUAL RUNS ONLY."""
    print(LICENSE_WARNING)

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        resp = await client.get(ARCHIVE_URL, timeout=60)
        resp.raise_for_status()

    releases = extract_releases(resp.text)
    items = [parse_release(r) for r in releases]
    print(f"  tomicars.club archive → {len(items)} releases")
    print(LICENSE_WARNING)
    return items

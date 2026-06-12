"""Output scraped data as JSON and SQL seed."""

import json
from pathlib import Path

def normalize_item(raw: dict) -> dict:
    model_number = raw.get("model_number", "")
    if model_number and not model_number.startswith("No."):
        model_number = f"No.{model_number}"
    return {
        "model_number": model_number,
        "car_name": raw.get("car_name", ""),
        "car_name_en": raw.get("car_name_en"),
        "car_name_zh_tw": raw.get("car_name_zh_tw"),
        "car_name_zh_hk": raw.get("car_name_zh_hk"),
        "car_name_zh_cn": raw.get("car_name_zh_cn"),
        "series": "regular",
        "is_first_edition": False,
        "manufacturer": raw.get("manufacturer"),
        "vehicle_type": raw.get("vehicle_type"),
        "body_color": raw.get("body_color", []),
        "release_date": raw.get("release_date"),
        "retired": False,
        "retired_at": raw.get("retired_at"),
        "image_url": raw.get("image_url"),
        "source": "official",
        "metadata": {},
    }

def write_json(items: list[dict], output_path: Path) -> None:
    normalized = [normalize_item(item) for item in items]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2))
    print(f"Wrote {len(normalized)} items to {output_path}")

def write_sql_seed(items: list[dict], output_path: Path) -> None:
    normalized = [normalize_item(item) for item in items]
    lines = []
    for item in normalized:
        colors = "{" + ",".join(f'"{c}"' for c in item["body_color"]) + "}"
        metadata = json.dumps(item["metadata"])
        lines.append(
            f"INSERT INTO tomica_catalog (model_number, car_name, car_name_en, car_name_zh_tw, car_name_zh_hk, car_name_zh_cn, series, is_first_edition, manufacturer, vehicle_type, body_color, release_date, retired_at, image_url, source, metadata) "
            f"VALUES ('{_esc(item['model_number'])}', '{_esc(item['car_name'])}', {_null_str(item['car_name_en'])}, {_null_str(item['car_name_zh_tw'])}, {_null_str(item['car_name_zh_hk'])}, {_null_str(item['car_name_zh_cn'])}, '{item['series']}', {item['is_first_edition']}, "
            f"{_null_str(item['manufacturer'])}, {_null_str(item['vehicle_type'])}, '{colors}', {_null_str(item['release_date'])}, {_null_str(item['retired_at'])}, {_null_str(item['image_url'])}, '{item['source']}', '{metadata}') "
            f"ON CONFLICT DO NOTHING;"
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines))
    print(f"Wrote {len(lines)} SQL inserts to {output_path}")

def _esc(s: str) -> str:
    return s.replace("'", "''") if s else ""

def _null_str(s: str | None) -> str:
    return f"'{_esc(s)}'" if s else "NULL"

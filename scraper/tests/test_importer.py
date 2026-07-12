from scraper.importer import build_row, parse_release_date


def test_year_month():
    assert parse_release_date("2026年9月") == "2026-09-01"


def test_year_month_day():
    assert parse_release_date("2026年9月15日") == "2026-09-15"


def test_zero_padded_year_month():
    assert parse_release_date("2026年09月") == "2026-09-01"


def test_empty_string():
    assert parse_release_date("") is None


def test_none_input():
    assert parse_release_date(None) is None


def test_undecided():
    assert parse_release_date("未定") is None


def test_garbage():
    assert parse_release_date("coming soon") is None


def _enriched_sample() -> dict:
    return {
        "series": "limited_vintage",
        "model_number": "LV-86h",
        "car_name": "ポルシェ911S（赤）67年式",
        "manufacturer": "輸入車",
        "image_url": "https://example.test/img.jpg",
        "release_date": "2026年9月",
        "price": "4,620円（税込）",
        "metadata": {"existing": "value"},
        "attributes": {"vehicle_category": "car", "primary_color": "red"},
        "car_name_en": "Porsche 911S (Red) 1967",
        "car_name_zh_tw": "保時捷 911S（紅）1967 年式",
        "description_en": "The 911S is the high-performance variant of the original 911. 1967 model year.",
        "description_zh_tw": "911S 是初代 911 的高性能版本。1967 年式。",
    }


def test_build_row_maps_release_date_to_iso():
    row = build_row(_enriched_sample())
    assert row["release_date"] == "2026-09-01"


def test_build_row_preserves_official_source():
    row = build_row(_enriched_sample())
    assert row["source"] == "official"


def test_build_row_carries_translation_fields():
    row = build_row(_enriched_sample())
    assert row["car_name_en"]       == "Porsche 911S (Red) 1967"
    assert row["car_name_zh_tw"]    == "保時捷 911S（紅）1967 年式"
    assert row["description_en"].startswith("The 911S")
    assert row["description_zh_tw"].startswith("911S")


def test_build_row_merges_price_into_metadata():
    row = build_row(_enriched_sample())
    assert row["metadata"]["price"]    == "4,620円（税込）"
    assert row["metadata"]["existing"] == "value"


def test_build_row_drops_unparseable_release_date():
    item = _enriched_sample()
    item["release_date"] = "未定"
    row = build_row(item)
    assert row["release_date"] is None

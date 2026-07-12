from scraper.enrich import validate_full_enrichment

GOOD = {
    "vehicle_category": "car",
    "body_style": "sedan",
    "primary_color": "red",
    "secondary_color": None,
    "wheel_count": 4,
    "size_class": "medium",
    "features": [],
    "era_style": "modern",
    "has_livery": False,
    "window_style": "standard",
    "car_name_en": "Nissan Skyline GT-R BNR34",
    "car_name_zh_tw": "日產 Skyline GT-R BNR34",
    "description_en": "A 1999 Japanese sports car. The R34 generation. Famous for its RB26 engine.",
    "description_zh_tw": "1999 年的日本跑車。R34 世代。以 RB26 引擎聞名。",
}


def test_valid_full_enrichment():
    result = validate_full_enrichment(GOOD)
    assert result is not None
    assert result["car_name_en"] == "Nissan Skyline GT-R BNR34"
    assert result["car_name_zh_tw"] == "日產 Skyline GT-R BNR34"
    assert result["description_en"].startswith("A 1999")
    assert result["description_zh_tw"].startswith("1999")


def test_rejects_missing_car_name_en():
    bad = dict(GOOD)
    del bad["car_name_en"]
    assert validate_full_enrichment(bad) is None


def test_rejects_empty_car_name_zh_tw():
    bad = dict(GOOD)
    bad["car_name_zh_tw"] = "   "
    assert validate_full_enrichment(bad) is None


def test_rejects_missing_description_zh_tw():
    bad = dict(GOOD)
    del bad["description_zh_tw"]
    assert validate_full_enrichment(bad) is None


def test_preserves_visual_attributes_block():
    result = validate_full_enrichment(GOOD)
    assert result["vehicle_category"] == "car"
    assert result["primary_color"] == "red"
    assert result["wheel_count"] == 4

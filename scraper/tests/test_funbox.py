"""Tests for funbox.py zh-TW name cleaning."""

import json
from pathlib import Path

import pytest

from scraper.funbox import _parse_product, clean_zh_tw_name

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def products() -> list[dict]:
    return json.loads((FIXTURES / "funbox_products.json").read_text())


@pytest.mark.parametrize("title,expected", [
    ("TOMICA No.072 Jeep Wrangler", "Jeep Wrangler"),
    ("TOMICA 亞版 No.126 恐龍聯結車 (一般色+初回色)", "恐龍聯結車"),
    ("TOMICA 初回 No.95 馬自達 RX-7", "馬自達 RX-7"),
    ("TOMICA No.012 豐田 Corolla 初回色", "豐田 Corolla"),
])
def test_clean_zh_tw_name(title: str, expected: str):
    assert clean_zh_tw_name(title) == expected


def test_parse_product_adds_car_name_zh_tw(products):
    item = _parse_product(products[0])
    assert item is not None
    assert item["car_name_zh_tw"] == "Jeep Wrangler"


def test_parse_product_keeps_existing_fields(products):
    item = _parse_product(products[1])
    assert item is not None
    # Existing output format must not break
    assert item["model_number"] == "No.126"
    assert item["car_name"] == "恐龍聯結車"
    assert item["car_name_tw"] == "恐龍聯結車"
    assert item["series"] == "regular"
    assert item["is_first_edition"] is True
    assert item["is_asia_version"] is True
    assert item["sku"] == "XBTMTA126X2"
    assert item["image_url"] == "https://cdn.funbox.example/no126.jpg"
    assert item["source"] == "funbox"
    assert item["in_stock"] is False
    # New field
    assert item["car_name_zh_tw"] == "恐龍聯結車"


def test_parse_product_skips_non_model(products):
    assert _parse_product(products[2]) is None

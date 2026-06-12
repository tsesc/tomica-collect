"""Tests for tomy_cn.py list page parsing."""

from pathlib import Path

import pytest

from scraper.tomy_cn import _clean_name, _parse_model_number, parse_list_page

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def list_html() -> str:
    return (FIXTURES / "tomy_cn_list.html").read_text()


def test_parse_list_page_count(list_html):
    # 4th li has empty title (skipped); second ul is not l-products (ignored)
    assert len(parse_list_page(list_html)) == 3


def test_parse_regular_item(list_html):
    item = parse_list_page(list_html)[0]
    assert item["model_number"] == "No.43"
    assert item["car_name_zh_cn"] == "多美卡仿真车"
    assert item["image_url"] == "https://www.tomy.cn/wp-content/uploads/2026/05/ZT01-3.jpg"
    assert item["product_url"] == "https://www.tomy.cn/tomica/item/01diecastcar/t950783"
    assert item["product_code"] == "950783"
    assert item["series_cn"] == "多美卡单品"
    assert item["price_cny"] == 35.0
    assert item["source"] == "tomy_cn"


def test_absolute_http_href_upgraded_to_https(list_html):
    item = parse_list_page(list_html)[1]
    assert item["product_url"] == "https://www.tomy.cn/tomica/item/01diecastcar/t950456"
    assert item["model_number"] == "No.12"
    assert item["car_name_zh_cn"] == "多美卡合金车 日产 GT-R"
    assert item["price_cny"] == 39.9


def test_item_without_model_code(list_html):
    item = parse_list_page(list_html)[2]
    assert item["model_number"] is None
    assert item["car_name_zh_cn"] == "迪士尼多美卡 米奇敞篷车"
    assert item["product_code"] == "228882"
    assert item["series_cn"] == "迪士尼多美卡"


@pytest.mark.parametrize("title,expected", [
    ("多美卡仿真车 #43-05", "No.43"),
    ("多美卡合金车 #12-08 日产 GT-R", "No.12"),
    ("迪士尼多美卡 米奇敞篷车", None),
])
def test_parse_model_number(title, expected):
    assert _parse_model_number(title) == expected


def test_clean_name_strips_code():
    assert _clean_name("多美卡合金车 #12-08 日产 GT-R") == "多美卡合金车 日产 GT-R"

"""Tests for the monthly new-product page parser."""

from pathlib import Path

from scraper.monthly_new import BASE_URL, _months_to_try, parse_monthly_page

FIXTURE = Path(__file__).parent / "fixtures" / "monthly_2606.html"


def _parse():
    return parse_monthly_page(FIXTURE.read_text(), "2606")


def test_parses_all_mapped_series_items():
    items = _parse()
    # 7 products in fixture, 1 (ジョブレイバー) has an unmapped series → skipped
    assert len(items) == 6


def test_regular_item_fields():
    items = _parse()
    item = next(i for i in items if i["model_number"] == "No.19")
    assert item["car_name"] == "ホンダ Super-ONE"  # <br> joined with space
    assert item["series"] == "regular"
    assert item["release_date"] == "2026-06-01"
    assert item["metadata"]["price_jpy"] == 594
    assert item["metadata"]["yymm"] == "2606"
    assert item["metadata"]["features"] == "サスペンション"
    assert item["manufacturer"] == "Honda"
    assert item["image_url"] == BASE_URL + "images/2606/pic_019_01.webp"
    assert item["source"] == "official"


def test_series_inferred_from_block_titles():
    items = _parse()
    by_series = {i["series"] for i in items}
    assert by_series == {"regular", "town", "dream", "premium", "premium_unlimited"}
    # unlimited must not be swallowed by the plain premium prefix
    unlimited = next(i for i in items if i["series"] == "premium_unlimited")
    assert unlimited["model_number"] == "No.12"


def test_fullwidth_parens_and_comma_price():
    items = _parse()
    town = next(i for i in items if i["series"] == "town")
    assert town["model_number"] == ""  # no No. prefix
    assert town["car_name"] == "いつでもどこでもトミカタウン"
    assert town["metadata"]["price_jpy"] == 6050


def test_release_date_can_differ_from_page_month():
    items = _parse()
    dream = next(i for i in items if i["series"] == "dream")
    assert dream["release_date"] == "2026-07-01"


def test_months_to_try_explicit_and_default():
    assert _months_to_try("2606") == ["2606"]
    months = _months_to_try(None)
    assert len(months) == 4  # current + 3 lookahead
    assert all(len(m) == 4 and m.isdigit() for m in months)


def test_months_to_try_wraps_year(monkeypatch):
    from datetime import date

    import scraper.monthly_new as mn

    class FakeDate(date):
        @classmethod
        def today(cls):
            return date(2026, 11, 1)

    monkeypatch.setattr(mn, "date", FakeDate)
    assert mn._months_to_try(None) == ["2611", "2612", "2701", "2702"]

from scraper.watch import diff_new_items


def test_returns_only_items_missing_from_existing():
    scraped = [
        {"series": "regular", "model_number": "No.1", "car_name": "A"},
        {"series": "regular", "model_number": "No.2", "car_name": "B"},
        {"series": "limited_vintage", "model_number": "LV-86h", "car_name": "C"},
    ]
    existing = {("regular", "No.1"), ("limited_vintage", "LV-86h")}

    new_items = diff_new_items(scraped, existing)

    assert len(new_items) == 1
    assert new_items[0]["model_number"] == "No.2"


def test_treats_same_model_number_in_different_series_as_distinct():
    scraped = [
        {"series": "regular",         "model_number": "No.5", "car_name": "Reg"},
        {"series": "limited_vintage", "model_number": "No.5", "car_name": "TLV"},
    ]
    existing = {("regular", "No.5")}

    new_items = diff_new_items(scraped, existing)

    assert len(new_items) == 1
    assert new_items[0]["series"] == "limited_vintage"


def test_empty_existing_returns_everything():
    scraped = [{"series": "regular", "model_number": "No.1", "car_name": "A"}]
    assert diff_new_items(scraped, set()) == scraped


def test_skips_items_without_image_url_only_when_filter_enabled():
    # diff itself does NOT filter on image_url; enrichment step does that.
    scraped = [
        {"series": "regular", "model_number": "No.99", "car_name": "X", "image_url": None},
    ]
    assert diff_new_items(scraped, set()) == scraped

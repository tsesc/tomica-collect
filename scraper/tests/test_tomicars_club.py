"""Tests for tomicars_club.py Flight payload parsing."""

from pathlib import Path

import pytest

import scraper.tomicars_club as tc
from scraper.tomicars_club import (
    LICENSE_WARNING,
    extract_flight_payload,
    extract_releases,
    parse_release,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def archive_html() -> str:
    return (FIXTURES / "tomicars_archive.html").read_text()


def test_extract_releases_concatenates_chunks(archive_html):
    # First release's name_en is split across two push chunks
    releases = extract_releases(archive_html)
    assert len(releases) == 2
    assert releases[0]["name_en"] == "Bluebird SSS Coupe"


def test_unescape_keeps_raw_utf8_and_decodes_uXXXX(archive_html):
    releases = extract_releases(archive_html)
    assert releases[0]["name_jp"] == "ブルーバード SSS クーペ"  # raw UTF-8
    assert releases[1]["name_jp"] == "トヨタ 2000GT"  # \uXXXX escapes


def test_parse_release_full_record(archive_html):
    item = parse_release(extract_releases(archive_html)[0])
    assert item["model_number"] == "No.1"
    assert item["variant"] == 1
    assert item["car_name"] == "ブルーバード SSS クーペ"
    assert item["car_name_en"] == "Bluebird SSS Coupe"
    assert item["release_start"] == "1970-08"
    assert item["release_end"] == "1974-09"
    assert item["series"] == "regular"
    assert item["source"] == "community"
    assert item["image_url"] == (
        "https://cms.tomicars.club/assets/d92c6291-1111-2222-3333-444444444444"
    )
    assert item["manufacturer"] == "Nissan"
    assert item["metadata"]["tomicars_release_id"] == "TOM-1-1-1970"
    assert item["metadata"]["tomicars_series"] == "Black Box"


def test_parse_release_sparse_record(archive_html):
    item = parse_release(extract_releases(archive_html)[1])
    assert item["model_number"] == "No.1"
    assert item["variant"] == 2
    assert item["car_name_en"] is None
    assert item["release_end"] is None
    assert item["image_url"] is None
    assert item["manufacturer"] == "Toyota"


def test_no_chunks_raises():
    with pytest.raises(ValueError, match="No self.__next_f.push chunks"):
        extract_flight_payload("<html><body>nothing here</body></html>")


def test_license_warning_present():
    # License unconfirmed — warning must exist in module docstring and constant
    assert "UNCONFIRMED" in LICENSE_WARNING
    assert "LICENSE UNCONFIRMED" in tc.__doc__
    assert "MANUAL-RUN ONLY" in tc.__doc__

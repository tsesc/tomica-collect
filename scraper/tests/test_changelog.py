"""Tests for snapshot diffing and retirement tracking."""

import json

from scraper.changelog import (
    PENDING_RETIREMENT_FILE,
    diff_snapshot,
    format_changelog,
    item_key,
    load_snapshot,
    save_snapshot,
    update_retirement_tracker,
)


def _item(model_number, car_name, series="regular", **extra):
    item = {
        "model_number": model_number,
        "car_name": car_name,
        "series": series,
        "release_date": None,
        "image_url": None,
        "retired": False,
        "metadata": {},
    }
    item.update(extra)
    return item


def test_item_key_normalizes_and_falls_back():
    assert item_key(_item("No.072", "Jeep")) == "regular:No.72"
    assert item_key(_item("No.72", "Jeep", series="premium")) == "premium:No.72"
    assert item_key(_item("", "トミカタウン", series="town")) == "town:トミカタウン"


def test_save_snapshot_is_stable(tmp_path):
    items = [_item("No.10", "B"), _item("No.2", "A")]
    path = save_snapshot(items, "test", tmp_path)
    text1 = path.read_text()
    # re-saving in different order produces identical bytes (git-diff friendly)
    save_snapshot(list(reversed(items)), "test", tmp_path)
    assert path.read_text() == text1
    assert text1.endswith("\n")
    loaded = load_snapshot("test", tmp_path)
    assert [i["model_number"] for i in loaded] == ["No.2", "No.10"]


def test_diff_no_previous_snapshot_all_added(tmp_path):
    diff = diff_snapshot([_item("No.1", "A")], "test", tmp_path)
    assert len(diff["added"]) == 1
    assert diff["removed"] == [] and diff["modified"] == []


def test_diff_added_removed_modified(tmp_path):
    old = [
        _item("No.1", "A", release_date="2026-05-01"),
        _item("No.2", "B"),
        _item("No.3", "C", metadata={"price_jpy": 594}),
    ]
    save_snapshot(old, "test", tmp_path)

    new = [
        _item("No.1", "A", release_date="2026-06-01"),  # modified field
        _item("No.3", "C", metadata={"price_jpy": 660}),  # modified metadata
        _item("No.4", "D"),  # added
    ]
    diff = diff_snapshot(new, "test", tmp_path)

    assert [i["model_number"] for i in diff["added"]] == ["No.4"]
    assert [i["model_number"] for i in diff["removed"]] == ["No.2"]
    keys = {m["key"]: m["changes"] for m in diff["modified"]}
    assert keys["regular:No.1"]["release_date"] == {
        "old": "2026-05-01", "new": "2026-06-01",
    }
    assert keys["regular:No.3"]["metadata.price_jpy"] == {"old": 594, "new": 660}


def test_diff_keys_leading_zeros_as_same_item(tmp_path):
    save_snapshot([_item("No.072", "Jeep")], "test", tmp_path)
    diff = diff_snapshot([_item("No.72", "Jeep")], "test", tmp_path)
    assert diff == {"added": [], "removed": [], "modified": []}


def test_retirement_confirmed_after_two_misses(tmp_path):
    gone = _item("No.5", "E")
    diff = {"removed": [gone]}

    # 1st absence → pending, not confirmed
    confirmed = update_retirement_tracker([], diff, tmp_path, today="2026-06-01")
    assert confirmed == []
    pending = json.loads((tmp_path / PENDING_RETIREMENT_FILE).read_text())
    assert pending["regular:No.5"]["miss_count"] == 1
    assert pending["regular:No.5"]["confirmed_retired"] is False

    # 2nd absence (snapshot already updated → not in removed again)
    confirmed = update_retirement_tracker([], {"removed": []}, tmp_path, today="2026-07-01")
    assert [i["model_number"] for i in confirmed] == ["No.5"]
    pending = json.loads((tmp_path / PENDING_RETIREMENT_FILE).read_text())
    assert pending["regular:No.5"]["miss_count"] == 2
    assert pending["regular:No.5"]["confirmed_retired"] is True


def test_retirement_reset_on_reappearance(tmp_path):
    gone = _item("No.5", "E")
    update_retirement_tracker([], {"removed": [gone]}, tmp_path, today="2026-06-01")
    # item shows up again next run
    confirmed = update_retirement_tracker([gone], {"removed": []}, tmp_path, today="2026-07-01")
    assert confirmed == []
    pending = json.loads((tmp_path / PENDING_RETIREMENT_FILE).read_text())
    assert pending == {}


def test_format_changelog_markdown():
    diff = {
        "added": [_item("No.19", "ホンダ Super-ONE", release_date="2026-06-01")],
        "removed": [_item("No.2", "B")],
        "modified": [
            {
                "key": "regular:No.1",
                "item": _item("No.1", "A"),
                "changes": {"image_url": {"old": None, "new": "https://x/y.webp"}},
            }
        ],
    }
    md = format_changelog(diff, confirmed_retired=[_item("No.5", "E")])
    assert "### Added (1)" in md
    assert "- **No.19** ホンダ Super-ONE (regular, 2026-06)" in md
    assert "### Modified (1)" in md
    assert "changed: image_url" in md
    assert "### Removed (1)" in md
    assert "### Confirmed Retired (1)" in md


def test_format_changelog_empty():
    md = format_changelog({"added": [], "removed": [], "modified": []})
    assert "No changes detected." in md

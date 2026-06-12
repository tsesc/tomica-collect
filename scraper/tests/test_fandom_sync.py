"""Tests for fandom incremental sync (RecentChanges)."""

import asyncio
import json

import pytest

from scraper import fandom
from scraper.fandom import (
    SyncStateMissing,
    _get_recent_changes,
    _resolve_series,
    load_sync_state,
    save_sync_state,
    sync_incremental,
)


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


class FakeClient:
    """Returns queued responses in order, records call params."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def get(self, url, params=None, timeout=None):
        self.calls.append(params)
        return FakeResponse(self.responses.pop(0))


def _rc_page(titles, rccontinue=None):
    payload = {
        "query": {
            "recentchanges": [
                {"type": "edit", "ns": 0, "title": t, "timestamp": "2026-06-13T00:00:00Z"}
                for t in titles
            ]
        }
    }
    if rccontinue:
        payload["continue"] = {"rccontinue": rccontinue}
    return payload


def _categories_page(title_to_cats):
    pages = {}
    for i, (title, cats) in enumerate(title_to_cats.items()):
        pages[str(i + 1)] = {
            "title": title,
            "categories": [{"title": f"Category:{c}"} for c in cats],
        }
    return {"query": {"pages": pages}}


def test_recent_changes_paginates_with_rccontinue():
    client = FakeClient([
        _rc_page(["No. 1 Bluebird SSS Coupe", "TP-01 Nissan GT-R"], rccontinue="20260613|123"),
        _rc_page(["TP-01 Nissan GT-R", "No. 57 Honda Super-ONE"]),  # dupe across pages
    ])
    titles = asyncio.run(_get_recent_changes(client, rcend="2026-06-01T00:00:00Z"))

    assert len(client.calls) == 2
    assert "rccontinue" not in client.calls[0]
    assert client.calls[1]["rccontinue"] == "20260613|123"
    assert client.calls[0]["rcend"] == "2026-06-01T00:00:00Z"
    assert client.calls[0]["rctype"] == "new|edit"
    assert client.calls[0]["rcnamespace"] == "0"
    # deduped, order preserved
    assert titles == ["No. 1 Bluebird SSS Coupe", "TP-01 Nissan GT-R", "No. 57 Honda Super-ONE"]


def test_sync_state_roundtrip(tmp_path):
    path = tmp_path / "fandom_sync_state.json"
    assert load_sync_state(path) is None
    save_sync_state("2026-06-13T01:02:03Z", path)
    assert load_sync_state(path) == "2026-06-13T01:02:03Z"
    assert json.loads(path.read_text()) == {"last_sync": "2026-06-13T01:02:03Z"}


def test_sync_state_null_treated_as_uninitialized(tmp_path):
    path = tmp_path / "fandom_sync_state.json"
    path.write_text('{"last_sync": null}')
    assert load_sync_state(path) is None


def test_sync_incremental_requires_state(tmp_path):
    with pytest.raises(SyncStateMissing):
        asyncio.run(sync_incremental(state_path=tmp_path / "missing.json"))


def test_sync_incremental_builds_items_for_changed_pages(tmp_path):
    state = tmp_path / "state.json"
    save_sync_state("2026-06-01T00:00:00Z", state)

    client = FakeClient([
        _rc_page(["TP-01 Nissan GT-R", "Some Unknown Page"]),
        _categories_page({
            "TP-01 Nissan GT-R": ["Tomica Premium"],
            "Some Unknown Page": ["2026 Tomica"],  # not in CATEGORIES → catch-all
        }),
    ])
    result = asyncio.run(sync_incremental(state_path=state, fetch_images=False, client=client))

    assert result["changed_pages"] == 2
    assert result["last_sync"] == "2026-06-01T00:00:00Z"
    assert result["new_sync"]  # timestamp captured, but state file untouched
    assert load_sync_state(state) == "2026-06-01T00:00:00Z"

    by_title = {item["metadata"]["wiki_title"]: item for item in result["items"]}
    premium = by_title["TP-01 Nissan GT-R"]
    assert premium["series"] == "premium"
    assert premium["model_number"] == "TP-01"
    assert premium["car_name"] == "Nissan GT-R"
    assert premium["source"] == "fandom"
    assert by_title["Some Unknown Page"]["series"] == "fandom"


def test_resolve_series_priority():
    assert _resolve_series(["2020 Tomica", "Tomica Premium"]) == "premium"
    assert _resolve_series(["Nonexistent Category"]) == "fandom"
    assert _resolve_series([]) == "fandom"


def test_fandom_sync_saves_state_on_success(tmp_path, monkeypatch):
    state = tmp_path / "state.json"
    save_sync_state("2026-06-01T00:00:00Z", state)

    items = [{"model_number": "TP-01", "metadata": {"wiki_title": "TP-01 Nissan GT-R"}}]

    async def fake_sync(state_path, fetch_images=True, client=None):
        return {
            "items": items,
            "changed_pages": 1,
            "last_sync": "2026-06-01T00:00:00Z",
            "new_sync": "2026-06-13T09:00:00Z",
        }

    monkeypatch.setattr(fandom, "sync_incremental", fake_sync)
    monkeypatch.setattr(
        fandom, "import_to_supabase", lambda i, k, u: {"inserted": len(i), "failed": 0}
    )

    summary = fandom.fandom_sync("key", "https://example.supabase.co", state_path=state)

    assert summary == {
        "changed_pages": 1,
        "inserted": 1,
        "failed": 0,
        "state_updated": True,
    }
    assert load_sync_state(state) == "2026-06-13T09:00:00Z"


def test_fandom_sync_keeps_state_on_failure(tmp_path, monkeypatch):
    state = tmp_path / "state.json"
    save_sync_state("2026-06-01T00:00:00Z", state)

    async def fake_sync(state_path, fetch_images=True, client=None):
        return {
            "items": [{"model_number": "TP-01"}],
            "changed_pages": 1,
            "last_sync": "2026-06-01T00:00:00Z",
            "new_sync": "2026-06-13T09:00:00Z",
        }

    monkeypatch.setattr(fandom, "sync_incremental", fake_sync)
    monkeypatch.setattr(
        fandom, "import_to_supabase", lambda i, k, u: {"inserted": 0, "failed": 1}
    )

    summary = fandom.fandom_sync("key", "https://example.supabase.co", state_path=state)

    assert summary["failed"] == 1
    assert summary["state_updated"] is False
    # state not advanced → next run retries from same last_sync
    assert load_sync_state(state) == "2026-06-01T00:00:00Z"

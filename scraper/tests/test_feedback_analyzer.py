"""Pure-data tests for feedback_analyzer aggregation logic."""

from datetime import datetime, timezone

from scraper.feedback_analyzer import aggregate_corrections, build_hint_payload

A = "aaaaaaaa-0000-0000-0000-000000000001"
B = "bbbbbbbb-0000-0000-0000-000000000002"
C = "cccccccc-0000-0000-0000-000000000003"


def row(orig, chosen):
    return {"original_top1_catalog_id": orig, "user_chosen_catalog_id": chosen}


def test_aggregates_repeated_mismatch():
    rows = [row(A, B), row(A, B), row(A, B)]
    hints = aggregate_corrections(rows, min_count=2)
    assert hints == {A: [{"catalog_id": B, "count": 3}]}


def test_min_count_threshold_filters_rare_pairs():
    rows = [row(A, B)]  # seen only once
    assert aggregate_corrections(rows, min_count=2) == {}


def test_min_count_one_keeps_single_occurrence():
    rows = [row(A, B)]
    hints = aggregate_corrections(rows, min_count=1)
    assert hints == {A: [{"catalog_id": B, "count": 1}]}


def test_ignores_rows_where_ai_was_correct():
    rows = [row(A, A), row(A, A), row(A, B), row(A, B)]
    hints = aggregate_corrections(rows, min_count=2)
    assert hints == {A: [{"catalog_id": B, "count": 2}]}


def test_ignores_rows_with_missing_ids():
    rows = [row(None, B), row(A, None), row(A, B), row(A, B)]
    hints = aggregate_corrections(rows, min_count=2)
    assert hints == {A: [{"catalog_id": B, "count": 2}]}


def test_multiple_targets_sorted_by_count_desc():
    rows = [row(A, B), row(A, B), row(A, C), row(A, C), row(A, C)]
    hints = aggregate_corrections(rows, min_count=2)
    assert hints[A] == [
        {"catalog_id": C, "count": 3},
        {"catalog_id": B, "count": 2},
    ]


def test_tie_broken_by_catalog_id_for_stability():
    rows = [row(A, C), row(A, C), row(A, B), row(A, B)]
    hints = aggregate_corrections(rows, min_count=2)
    assert hints[A] == [
        {"catalog_id": B, "count": 2},
        {"catalog_id": C, "count": 2},
    ]


def test_independent_originals_get_separate_hints():
    rows = [row(A, C), row(A, C), row(B, C), row(B, C)]
    hints = aggregate_corrections(rows, min_count=2)
    assert set(hints) == {A, B}
    assert hints[A] == [{"catalog_id": C, "count": 2}]
    assert hints[B] == [{"catalog_id": C, "count": 2}]


def test_build_hint_payload_shape():
    now = datetime(2026, 6, 13, tzinfo=timezone.utc)
    payload = build_hint_payload([{"catalog_id": B, "count": 2}], now=now)
    assert payload == {
        "confused_with": [{"catalog_id": B, "count": 2}],
        "updated_at": "2026-06-13T00:00:00+00:00",
    }

"""test_param_diff.py — port of typescript/packages/var-core/tests/param-diff.test.ts"""
from __future__ import annotations

from var.param_diff import compare_params
from var.span import span_from_offsets

_SOURCE = "I should have 3 cukes in my big belly"


def _span(s: int, e: int):  # type: ignore[no-untyped-def]
    return span_from_offsets(_SOURCE, s, e)


def test_all_elements_equal_every_cell_ok() -> None:
    diffs = compare_params(
        [3, "big"],
        [3, "big"],
        [_span(14, 15), _span(31, 34)],
        ["3", "big"],
    )
    assert all(d.ok for d in diffs)


def test_one_mismatching_element_cell_not_ok_with_expected_actual() -> None:
    diffs = compare_params(
        [4, "big"],
        [3, "big"],
        [_span(14, 15), _span(31, 34)],
        ["3", "big"],
    )
    assert diffs[0].column == "arg 1"
    assert diffs[0].expected == "3"
    assert diffs[0].actual == "4"
    assert diffs[0].ok is False
    assert diffs[1].column == "arg 2"
    assert diffs[1].ok is True


def test_object_actuals_compare_structurally_across_references() -> None:
    diffs = compare_params(
        [{"iso": "NO"}],
        [{"iso": "NO"}],
        [_span(0, 2)],
        ["NO"],
    )
    assert diffs[0].ok is True

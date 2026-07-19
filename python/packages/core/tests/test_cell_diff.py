"""test_cell_diff.py — port of typescript/packages/core/tests/cell-diff.test.ts"""
from __future__ import annotations

import pytest

from varar_core.ast import Table
from varar_core.cell_diff import (
    CellDiff,
    CellMismatchError,
    ReturnShapeError,
    RowCheck,
    compare_row,
    compare_table,
    is_cell_mismatch_error,
)
from varar_core.parse import parse
from varar_core.span import Span

_span = Span(start_offset=0, end_offset=1, start_line=1, start_col=1, end_line=1, end_col=2)
_checks: tuple[RowCheck, ...] = (
    RowCheck(column="dice", value="3, 3, 3, 4, 4", span=_span),
    RowCheck(column="score", value="9", span=_span),
)


def test_returned_column_matches_is_ok() -> None:
    diffs = compare_row({"score": 9}, _checks)
    assert diffs == (CellDiff(column="score", span=_span, expected="9", actual="9", ok=True),)


def test_returned_column_differs_is_not_ok() -> None:
    diffs = compare_row({"score": 6}, _checks)
    assert diffs == (CellDiff(column="score", span=_span, expected="9", actual="6", ok=False),)


def test_columns_not_returned_are_inputs_not_checked() -> None:
    diffs = compare_row({"score": 9}, _checks)
    assert [d.column for d in diffs] == ["score"]


def test_returned_key_not_a_column_is_ignored() -> None:
    assert compare_row({"nope": 1}, _checks) == ()


def test_none_and_non_dict_return_checks_nothing() -> None:
    assert compare_row(None, _checks) == ()
    assert compare_row(42, _checks) == ()


def test_cell_mismatch_error_carries_cells_and_is_detectable() -> None:
    err = CellMismatchError(
        [CellDiff(column="score", span=_span, expected="9", actual="6", ok=False)]
    )
    assert is_cell_mismatch_error(err) is True
    assert is_cell_mismatch_error(Exception("x")) is False
    assert err.cells[0].actual == "6"
    assert "score" in str(err)


# ---------------------------------------------------------------------------
# compareTable
# ---------------------------------------------------------------------------

TABLE_SRC = """\
# T

these:

| before | after |
| ------ | ----- |
| var    | VAR   |
| bdd    | BDD   |"""


def _table_of(source: str) -> tuple[Table, str]:
    doc = parse("t.md", source)
    table = next((b for b in doc.examples[0].body if b.kind == "table"), None)
    if table is None:
        raise ValueError("no table parsed")
    assert isinstance(table, Table)
    return table, source


def test_compare_table_array_of_arrays_full_match_all_ok() -> None:
    table, _ = _table_of(TABLE_SRC)
    diffs = compare_table([["var", "VAR"], ["bdd", "BDD"]], table)
    assert len(diffs) == 4
    assert all(d.ok for d in diffs)


def test_compare_table_array_of_records_full_match_all_ok() -> None:
    table, _ = _table_of(TABLE_SRC)
    diffs = compare_table(
        [{"before": "var", "after": "VAR"}, {"before": "bdd", "after": "BDD"}], table
    )
    assert all(d.ok for d in diffs)


def test_compare_table_one_wrong_cell_not_ok_with_expected_actual_span() -> None:
    table, source = _table_of(TABLE_SRC)
    diffs = compare_table([["var", "WRONG"], ["bdd", "BDD"]], table)
    bad = [d for d in diffs if not d.ok]
    assert len(bad) == 1
    assert bad[0].column == "after"
    assert bad[0].expected == "VAR"
    assert bad[0].actual == "WRONG"
    # span points at the 'VAR' cell in the source (ASCII so UTF-16 == byte offset)
    assert source[bad[0].span.start_offset : bad[0].span.end_offset] == "VAR"


def test_compare_table_numbers_stringified_before_compare() -> None:
    src = """\
# T

these:

| n |
| - |
| 7 |"""
    table, _ = _table_of(src)
    assert all(d.ok for d in compare_table([[7]], table))


def test_compare_table_none_return_checks_nothing() -> None:
    table, _ = _table_of(TABLE_SRC)
    assert compare_table(None, table) == ()


def test_compare_table_extra_keys_on_record_are_ignored() -> None:
    table, _ = _table_of(TABLE_SRC)
    diffs = compare_table(
        [
            {"before": "var", "after": "VAR", "extra": "ignored"},
            {"before": "bdd", "after": "BDD", "note": 123},
        ],
        table,
    )
    assert all(d.ok for d in diffs)
    assert [d.column for d in diffs] == ["before", "after", "before", "after"]


def test_compare_table_shape_type_errors_raise_return_shape_error() -> None:
    table, _ = _table_of(TABLE_SRC)
    with pytest.raises(ReturnShapeError):
        compare_table("nope", table)  # not a list
    with pytest.raises(ReturnShapeError):
        compare_table([["var", "VAR"]], table)  # wrong row count
    with pytest.raises(ReturnShapeError):
        compare_table([["var"], ["bdd"]], table)  # wrong width
    with pytest.raises(ReturnShapeError):
        compare_table([{"before": "var"}, {"before": "bdd"}], table)  # missing key
    with pytest.raises(ReturnShapeError):
        compare_table(
            [["var", "VAR"], {"before": "bdd", "after": "BDD"}], table
        )  # mixed forms

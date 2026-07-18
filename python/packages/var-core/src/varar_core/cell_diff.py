"""cell_diff.py — port of typescript/packages/var-core/src/cell-diff.ts.

Pure functions and immutable types for comparing row/table step returns against
the authored Markdown cells.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from varar_core.ast import Table
from varar_core.span import Span


@dataclass(frozen=True, slots=True)
class RowCheck:
    """One checked column of one header-bound row: the input the comparison needs."""

    column: str
    value: str   # the cell text, e.g. "9"
    span: Span   # the cell text's source range in the .md


@dataclass(frozen=True, slots=True)
class CellDiff:
    """The verdict for one checked column after comparing against the table."""

    column: str
    span: Span
    expected: str
    actual: str
    ok: bool
    # The raw pre-display values, present on the inline-parameter path (where
    # comparison is deep equality over transformed values). Adapter-facing;
    # never serialized into run results or conformance artifacts.
    expected_value: Any = None
    actual_value: Any = None
    # True when the parameter type's ``format`` rendered ``actual`` — the
    # display pair is document notation, and adapters should prefer it over
    # the raw values in their expected/actual projection.
    formatted: bool = False


def render_cell_value(value: Any) -> str:
    """Display rules 2-4 of the mismatch-rendering chain.

    Rule 1, the parameter type's ``format``, applies only on the
    inline-parameter path — see param_diff.py. A string renders as-is, any
    other primitive via ``str``, anything else via ``repr``. The ``repr``
    fallback is port-native and deliberately outside conformance — bundles
    that pin an object actual must use ``format``.
    """
    if isinstance(value, str):
        return value
    if value is None or isinstance(value, (bool, int, float)):
        return str(value)
    return repr(value)


def compare_row(
    returned: Any,
    checks: Sequence[RowCheck],
) -> tuple[CellDiff, ...]:
    """Compare a row step's returned dict against the row's cells.

    Only columns present on *returned* are checked; the rest are inputs.
    A non-dict return (including None) checks nothing.
    """
    if returned is None or not isinstance(returned, dict):
        return ()
    diffs: list[CellDiff] = []
    for check in checks:
        if check.column not in returned:
            continue
        actual = render_cell_value(returned[check.column])
        diffs.append(
            CellDiff(
                column=check.column,
                span=check.span,
                expected=check.value,
                actual=actual,
                ok=actual == check.value,
            )
        )
    return tuple(diffs)


class CellMismatchError(Exception):
    """Raised when a header-bound row's returned columns don't all match.

    Carries the mismatched cells so adapters can render/record them.
    """

    cells: tuple[CellDiff, ...]

    def __init__(self, cells: Sequence[CellDiff]) -> None:
        self.cells = tuple(cells)
        msg = "; ".join(
            f"{c.column}: expected {c.expected} but was {c.actual}" for c in self.cells
        )
        super().__init__(msg)


def is_cell_mismatch_error(e: object) -> bool:
    return isinstance(e, CellMismatchError)


class ReturnShapeError(Exception):
    """The step returned the wrong type or shape — an author mistake, not a value diff."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


def compare_table(
    returned: Any,
    input_table: Table,
) -> tuple[CellDiff, ...]:
    """Compare a whole-table step's returned table against the input table.

    *returned* may be:
    - None           → no checks (returns empty tuple)
    - list[list]     → positional (array-of-arrays)
    - list[dict]     → keyed by header cell (array-of-records)

    Cells compare as exact strings (``str(value) == cell_text``).
    Type/shape problems raise ``ReturnShapeError``.
    """
    if returned is None:
        return ()
    if not isinstance(returned, list):
        raise ReturnShapeError(
            f"expected a table (array of rows), got {type(returned).__name__}"
        )

    columns = input_table.header.cells  # type: ignore[union-attr]
    data_rows = input_table.rows

    if len(returned) != len(data_rows):
        raise ReturnShapeError(
            f"expected {len(data_rows)} row(s), got {len(returned)}"
        )

    def _is_record(r: Any) -> bool:
        return isinstance(r, dict)

    all_arrays = all(isinstance(r, list) for r in returned)
    all_records = all(_is_record(r) for r in returned)

    if not all_arrays and not all_records:
        raise ReturnShapeError("table rows must be all arrays or all objects")

    diffs: list[CellDiff] = []
    for i, row in enumerate(data_rows):
        ret = returned[i]
        if all_arrays:
            cells_ret: list[Any] = ret
            if len(cells_ret) != len(columns):
                raise ReturnShapeError(
                    f"row {i}: expected {len(columns)} column(s), got {len(cells_ret)}"
                )
        for j, column in enumerate(columns):
            if all_arrays:
                actual_value = ret[j]
            else:
                rec: dict[str, Any] = ret
                if column not in rec:
                    raise ReturnShapeError(f'row {i}: missing column "{column}"')
                actual_value = rec[column]

            expected = row.cells[j] if j < len(row.cells) else ""
            actual = render_cell_value(actual_value)
            span: Span = row.cell_spans[j] if j < len(row.cell_spans) else row.span  # type: ignore[assignment]
            diffs.append(
                CellDiff(
                    column=column,
                    span=span,
                    expected=expected,
                    actual=actual,
                    ok=actual == expected,
                )
            )
    return tuple(diffs)

"""Tests for render_failure — pure human-readable rendering of diff errors."""
from var.cell_diff import CellDiff, CellMismatchError, ReturnShapeError
from var.doc_string_diff import DocStringDiff, DocStringMismatchError
from var.span import Span

from var_runner.render import UndefinedStepError, render_failure


def _span(line: int) -> Span:
    """Minimal Span anchored to a known line (offsets are arbitrary for rendering)."""
    return Span(
        start_offset=0,
        end_offset=1,
        start_line=line,
        start_col=1,
        end_line=line,
        end_col=2,
    )


# ---------------------------------------------------------------------------
# CellMismatchError
# ---------------------------------------------------------------------------


def test_cell_mismatch_lists_failing_cells():
    cells = (
        CellDiff(column="total", span=_span(7), expected="9", actual="8", ok=False),
        CellDiff(column="label", span=_span(7), expected="foo", actual="foo", ok=True),
    )
    error = CellMismatchError(cells)
    result = render_failure(error, "", "spec.md")

    assert "total" in result
    assert "9" in result       # expected
    assert "8" in result       # actual
    assert "7" in result       # line number
    assert "spec.md" in result


def test_cell_mismatch_omits_passing_cells():
    cells = (
        CellDiff(column="ok_col", span=_span(3), expected="x", actual="x", ok=True),
    )
    error = CellMismatchError(cells)
    result = render_failure(error, "", "spec.md")
    # No failing cells — should still mention the file but not "ok_col"
    assert "ok_col" not in result


def test_cell_mismatch_multiple_failing():
    cells = (
        CellDiff(column="a", span=_span(10), expected="1", actual="2", ok=False),
        CellDiff(column="b", span=_span(11), expected="3", actual="4", ok=False),
    )
    error = CellMismatchError(cells)
    result = render_failure(error, "", "my.md")

    assert "a" in result
    assert "b" in result
    assert "10" in result
    assert "11" in result


# ---------------------------------------------------------------------------
# DocStringMismatchError
# ---------------------------------------------------------------------------


def test_doc_string_mismatch_shows_expected_actual_and_line():
    diff = DocStringDiff(span=_span(15), expected="hello\n", actual="world\n")
    error = DocStringMismatchError(diff)
    result = render_failure(error, "", "doc.md")

    assert "hello" in result
    assert "world" in result
    assert "15" in result


# ---------------------------------------------------------------------------
# ReturnShapeError
# ---------------------------------------------------------------------------


def test_return_shape_error_renders_message():
    error = ReturnShapeError("expected a table, got str")
    result = render_failure(error, "", "spec.md")

    assert "expected a table, got str" in result


# ---------------------------------------------------------------------------
# Generic exception
# ---------------------------------------------------------------------------


def test_generic_exception_renders_type_and_message():
    error = ValueError("boom")
    result = render_failure(error, "", "spec.md")

    assert result == "ValueError: boom"


# ---------------------------------------------------------------------------
# UndefinedStepError
# ---------------------------------------------------------------------------


def test_undefined_step_renders_step_text():
    error = UndefinedStepError("I do something undefined")
    result = render_failure(error, "", "spec.md")

    assert "Undefined step" in result
    assert "I do something undefined" in result


def test_undefined_step_message_does_not_duplicate():
    """render_failure should return 'Undefined step: <text>', not nest the prefix."""
    error = UndefinedStepError("I open the app")
    result = render_failure(error, "", "spec.md")

    assert result == "Undefined step: I open the app"

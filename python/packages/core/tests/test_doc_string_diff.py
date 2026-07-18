"""test_doc_string_diff.py — port of typescript/packages/core/tests/doc-string-diff.test.ts"""
from __future__ import annotations

import pytest

from varar_core.cell_diff import ReturnShapeError
from varar_core.doc_string_diff import (
    DocStringMismatchError,
    compare_doc_string,
    is_doc_string_mismatch_error,
)
from varar_core.span import Span

_span = Span(start_offset=0, end_offset=6, start_line=1, start_col=1, end_line=1, end_col=6)


def test_equal_content_returns_none() -> None:
    assert compare_doc_string("hello\n", "hello\n", _span) is None


def test_none_return_returns_none_asserted_nothing() -> None:
    assert compare_doc_string(None, "hello\n", _span) is None


def test_different_content_returns_diff_with_span_expected_actual() -> None:
    result = compare_doc_string("bye\n", "hello\n", _span)
    assert result is not None
    assert result.span == _span
    assert result.expected == "hello\n"
    assert result.actual == "bye\n"


def test_non_string_return_raises_return_shape_error() -> None:
    with pytest.raises(ReturnShapeError):
        compare_doc_string(42, "hello\n", _span)


def test_doc_string_mismatch_error_carries_diff_and_is_detectable() -> None:
    from varar_core.doc_string_diff import DocStringDiff

    diff = DocStringDiff(span=_span, expected="hello\n", actual="bye\n")
    err = DocStringMismatchError(diff)
    assert is_doc_string_mismatch_error(err) is True
    assert is_doc_string_mismatch_error(Exception("x")) is False
    assert err.diff.actual == "bye\n"

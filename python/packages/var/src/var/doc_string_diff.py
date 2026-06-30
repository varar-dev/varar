"""doc_string_diff.py — port of typescript/packages/var-core/src/doc-string-diff.ts.

Pure comparison of a doc-string step's return value against the fence body.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from var.cell_diff import ReturnShapeError
from var.span import Span


@dataclass(frozen=True, slots=True)
class DocStringDiff:
    """A doc-string content difference: fence body span, expected, and actual text."""

    span: Span
    expected: str
    actual: str


def compare_doc_string(
    returned: Any,
    content: str,
    span: Span,
) -> DocStringDiff | None:
    """Compare a doc-string step's return against the fence body.

    - ``None``    → no check (returns None)
    - equal str   → returns None (pass)
    - unequal str → returns DocStringDiff
    - non-string  → raises ReturnShapeError
    """
    if returned is None:
        return None
    if not isinstance(returned, str):
        raise ReturnShapeError(
            f"expected a doc string (string), got {type(returned).__name__}"
        )
    if returned == content:
        return None
    return DocStringDiff(span=span, expected=content, actual=returned)


class DocStringMismatchError(Exception):
    """Raised when a doc-string step's returned string differs from the authored content."""

    diff: DocStringDiff

    def __init__(self, diff: DocStringDiff) -> None:
        self.diff = diff
        super().__init__(
            f"doc string: expected {diff.expected!r} but was {diff.actual!r}"
        )


def is_doc_string_mismatch_error(e: object) -> bool:
    return isinstance(e, DocStringMismatchError)

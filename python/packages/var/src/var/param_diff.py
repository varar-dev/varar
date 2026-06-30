"""param_diff.py — port of typescript/packages/var-core/src/param-diff.ts.

Compare a sensor's returned inline actuals against captured document values.
"""
from __future__ import annotations

from typing import Any, Sequence

from var.cell_diff import CellDiff
from var.span import Span


def compare_params(
    returned: Sequence[Any],
    expected: Sequence[Any],
    param_spans: Sequence[Span],
    source_texts: Sequence[str],
) -> tuple[CellDiff, ...]:
    """Compare returned actuals against expected values captured from the document.

    ``expected``, ``param_spans``, and ``source_texts`` align 1:1 with ``returned``;
    the caller validates length first.  Structural equality (Python ``==``) is used
    so objects compare by value across references.
    """
    diffs: list[CellDiff] = []
    for i in range(len(expected)):
        ok = returned[i] == expected[i]
        diffs.append(
            CellDiff(
                column=f"arg {i + 1}",
                span=param_spans[i],
                expected=source_texts[i] if i < len(source_texts) else str(expected[i]),
                actual=str(returned[i]),
                ok=ok,
            )
        )
    return tuple(diffs)

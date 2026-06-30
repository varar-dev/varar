"""render.py — pure human-readable rendering of var diff errors.

Pure function: no I/O, no side effects.
"""
from __future__ import annotations

from var.cell_diff import ReturnShapeError, is_cell_mismatch_error
from var.doc_string_diff import is_doc_string_mismatch_error


class UndefinedStepError(Exception):
    """Raised by adapters when a spec example has no matching step definition.

    The core planner silently drops examples with no matching steps (treating
    them as plain docs).  Adapters that want to surface the gap as a test
    failure raise this error in the example's run closure so that
    ``repr_failure`` can present an actionable message.
    """

    def __init__(self, step_text: str) -> None:
        super().__init__(f"Undefined step: {step_text}")
        self.step_text = step_text


def render_failure(error: BaseException, source: str, var_path: str) -> str:  # noqa: ARG001
    """Render a step failure as a human-readable, markdown-anchored string.

    Dispatches on the concrete error type:
    - CellMismatchError   → list each failing cell with column/expected/actual/line.
    - DocStringMismatchError → expected vs actual + line.
    - ReturnShapeError    → its message.
    - Any other exception → ``TypeName: message``.

    ``source`` is available for additional context but line numbers from spans
    are the primary anchor.
    """
    if is_cell_mismatch_error(error):
        lines: list[str] = [f"Cell mismatch in {var_path}:"]
        failing = [c for c in error.cells if not c.ok]  # type: ignore[union-attr]
        if not failing:
            lines.append("  (no failing cells)")
        for cell in failing:
            lines.append(
                f"  line {cell.span.start_line} | column '{cell.column}'"
                f" — expected: {cell.expected!r}, actual: {cell.actual!r}"
            )
        return "\n".join(lines)

    if is_doc_string_mismatch_error(error):
        diff = error.diff  # type: ignore[union-attr]
        return (
            f"Doc string mismatch at line {diff.span.start_line}:\n"
            f"  expected: {diff.expected!r}\n"
            f"  actual:   {diff.actual!r}"
        )

    if isinstance(error, ReturnShapeError):
        return str(error)

    if isinstance(error, UndefinedStepError):
        return f"Undefined step: {error.step_text}"

    return f"{type(error).__name__}: {error}"

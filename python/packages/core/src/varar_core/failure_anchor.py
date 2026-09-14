"""failure_anchor.py — where a failure points in the .md source.

Port of failureAnchor from typescript/packages/core/src/failure-anchor.ts.
A mismatch anchors at its first failing span (the cell, the doc string fence
body), anything else at the fallback — the step's match start. This rule is
the single source of truth for failure locations: the executor's stack
augmentation renders it per-runtime, and the conformance trace pins it as
``failure.anchor``, so every language port must reproduce it byte-for-byte.
"""

from __future__ import annotations

from varar_core.cell_diff import is_cell_mismatch_error
from varar_core.span import Span


def failure_anchor(error: object, fallback: Span) -> Span:
    if is_cell_mismatch_error(error):
        return next((c.span for c in error.cells if not c.ok), fallback)
    return fallback


# The anchor travels with the raised error, from the executor (which knows the
# step) to whoever builds the ExampleFailure payload (which only sees the
# error) — mirroring the TS port, where it rides on the Error under
# Symbol.for('varar.failureAnchor'). Without it a renderer only has the line
# number, so it underlines the whole line instead of the step that failed.
_ANCHOR_ATTR = "__varar_failure_anchor__"


def attach_failure_anchor(error: object, anchor: Span) -> None:
    """Record on the error itself where the failure points."""
    try:
        setattr(error, _ANCHOR_ATTR, anchor)
    except (AttributeError, TypeError):
        # Something raised without a writable __dict__ carries no anchor; the
        # renderer then falls back to the failing line, as it always did.
        pass


def read_failure_anchor(error: object) -> Span | None:
    """The anchor the executor attached, or None if there is none."""
    anchor = getattr(error, _ANCHOR_ATTR, None)
    return anchor if isinstance(anchor, Span) else None


# The document the anchor's offsets belong to, for a step a reference block
# spliced in from another oath (ADR 0016). Travels the same way and for the same
# reason as the anchor: the executor knows the step, and whoever builds the
# failure payload sees only the error.
_DOC_PATH_ATTR = "__varar_failure_doc_path__"


def attach_failure_doc_path(error: object, doc_path: str) -> None:
    """Record on the error itself which document its offsets are into."""
    try:
        setattr(error, _DOC_PATH_ATTR, doc_path)
    except (AttributeError, TypeError):
        pass


def read_failure_doc_path(error: object) -> str | None:
    """The document path the executor attached, or None for the oath's own."""
    doc_path = getattr(error, _DOC_PATH_ATTR, None)
    return doc_path if isinstance(doc_path, str) else None

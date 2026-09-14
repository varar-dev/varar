"""diagnostics.py — port of typescript/packages/core/src/diagnostics.ts.

Only the subset needed by the planner is ported here:
  Severity, DiagnosticCode, Diagnostic, Candidate, AmbiguousInput,
  ambiguous_match(), error_fence_without_step().
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from varar_core.span import Span

Severity = Literal["error", "warning"]
DiagnosticCode = Literal[
    "ambiguous-match",
    "error-fence-without-step",
    "drift",
    "reference-not-found",
    "reference-empty",
    "reference-cycle",
    "ambiguous-anchor",
]


@dataclass(frozen=True, slots=True)
class Candidate:
    expression: str
    source_file: str
    source_line: int


@dataclass(frozen=True, slots=True)
class Diagnostic:
    code: DiagnosticCode
    severity: Severity
    message: str
    span: Span


@dataclass(frozen=True, slots=True)
class AmbiguousInput:
    text: str
    span: Span
    candidates: tuple[Candidate, ...]


def ambiguous_match(input: AmbiguousInput) -> Diagnostic:
    """Mirror ambiguousMatch() from diagnostics.ts."""
    lines = "\n".join(
        f"  '{c.expression}'    at {c.source_file}:{c.source_line}"
        for c in input.candidates
    )
    return Diagnostic(
        severity="error",
        code="ambiguous-match",
        message=f'Ambiguous step: "{input.text}"\nMatched by:\n{lines}',
        span=input.span,
    )


def drift_detected(name: str, span: Span) -> Diagnostic:
    """Mirror driftDetected() from diagnostics.ts.

    A paragraph the baseline recorded as an example no longer matches any step:
    drift. Rides the shared Diagnostic rail so every surface reports it the same
    way. ``span`` points at the drifted paragraph.
    """
    return Diagnostic(
        severity="error",
        code="drift",
        message=(
            f'This paragraph was an example and no longer matches any step (drift): "{name}".\n'
            "Fix the step so it matches again, or accept it as prose (run in update mode)."
        ),
        span=span,
    )


def error_fence_without_step(span: Span) -> Diagnostic:
    """Mirror errorFenceWithoutStep() from diagnostics.ts."""
    return Diagnostic(
        severity="error",
        code="error-fence-without-step",
        message=(
            "This `error` fence marks the example as expected-to-fail, "
            "but the example has no step to run."
        ),
        span=span,
    )


def reference_not_found(text: str, path: str, span: Span) -> Diagnostic:
    """A reference block (ADR 0016) points at an oath the workspace does not
    hold. Never prose: a link-only block that resolves to nothing has no other
    reading, so it fails the run rather than degrading silently."""
    return Diagnostic(
        severity="error",
        code="reference-not-found",
        message=(
            f'Reference to "{text}" points at "{path}", which is not an oath in this '
            "workspace.\nCheck the path, and that the file is matched by the `docs` globs "
            "in varar.config.json."
        ),
        span=span,
    )


def reference_empty(text: str, path: str, slug: str, span: Span) -> Diagnostic:
    """The referenced document exists but the section contributes no steps — a
    mistyped anchor, or a section that is pure prose."""
    where = path if slug == "" else f"{path}#{slug}"
    return Diagnostic(
        severity="error",
        code="reference-empty",
        message=(
            f'Reference to "{text}" resolves to "{where}", which contributes no steps.\n'
            "Check the heading the anchor names, and that its section contains a matching "
            "paragraph."
        ),
        span=span,
    )


def ambiguous_anchor(
    text: str, path: str, slug: str, heading_lines: tuple[int, ...], span: Span
) -> Diagnostic:
    """Two headings in the referenced document slug to the same anchor, so the
    reference could mean either section. GitHub would suffix the second one
    (`#slug-1`); Varar refuses to guess and asks for distinct headings."""
    lines = ", ".join(str(line) for line in heading_lines)
    return Diagnostic(
        severity="error",
        code="ambiguous-anchor",
        message=(
            f'Reference to "{text}" is ambiguous: "{path}" has {len(heading_lines)} headings '
            f'with the anchor "#{slug}" (lines {lines}).\n'
            "Rename the headings so each has an anchor of its own."
        ),
        span=span,
    )


def reference_cycle(chain: tuple[str, ...], span: Span) -> Diagnostic:
    """References may nest to any depth (depth is a style question, not a rule),
    so a chain that reaches a section already on it must be reported rather than
    recursed into."""
    return Diagnostic(
        severity="error",
        code="reference-cycle",
        message="Reference cycle: " + " \u2192 ".join(chain) + ".",
        span=span,
    )

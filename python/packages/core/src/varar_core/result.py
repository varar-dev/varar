"""result.py — port of typescript/packages/core/src/result.ts.

Immutable dataclasses for run results (CellFailure, ExampleResult, OathResults).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class CellFailure:
    """One mismatched CELL as a source-offset range plus the runtime value.

    ``from_`` maps to the ``from`` field in the wire format (``from`` is a Python
    keyword); ``to`` is exclusive.  Offsets are UTF-16 code units.
    """

    from_: int  # 'from' is a Python keyword — serialised as 'from' in JSON
    to: int
    actual: str


@dataclass(frozen=True, slots=True)
class AnchorRange:
    """Where a failure points in the source: an offset range, ``to`` exclusive.

    The failing step's match span, or the first mismatched cell's span (the
    failure_anchor rule). This is what lets a renderer underline the step that
    failed rather than the whole line it sits on. ``from_`` maps to ``from`` in
    the wire format, as in CellFailure.
    """

    from_: int
    to: int


@dataclass(frozen=True, slots=True)
class ExampleFailure:
    """The failure payload inside an ExampleResult."""

    line: int
    message: str
    stack: str
    cells: tuple[CellFailure, ...] | None = None
    # Optional for the same reason ``cells`` is: a result written by a port (or
    # a release) that doesn't record it still reads, and falls back to ``line``.
    anchor: AnchorRange | None = None
    # The document ``line``, ``cells`` and ``anchor`` are offsets INTO. None —
    # the overwhelming majority — means the oath itself. Set only when the
    # failing step was spliced in from another oath by a reference block (ADR
    # 0016): its spans belong to that document, and a renderer that placed them
    # in this one would underline whatever text sat at those offsets.
    doc_path: str | None = None


@dataclass(frozen=True, slots=True)
class ReferencedDocument:
    """An oath other than this one that contributed steps to the run, with its
    source hash as run (ADR 0016)."""

    path: str
    source_hash: str


@dataclass(frozen=True, slots=True)
class ExampleResult:
    """Run result for a single BDD example."""

    name: str
    status: Literal["passed", "failed"]
    lines: tuple[int, ...]
    failure: ExampleFailure | None = None


@dataclass(frozen=True, slots=True)
class OathResults:
    """The persisted run result for one oath file (.varar/<oath>.json)."""

    version: int  # always 2
    oath_path: str  # POSIX separators, relative to cwd
    source_hash: str  # hashSource(oath source) at run time
    examples: tuple[ExampleResult, ...]
    # Every OTHER document this run's steps came from — the oaths a reference
    # block pulled steps in from (ADR 0016), with their hashes as run. Empty
    # when no step was spliced in, which is the common case.
    documents: tuple[ReferencedDocument, ...] = ()


def to_wire(results: OathResults) -> dict:
    """Project OathResults onto the JSON shape of ``.varar/<oath>.json``.

    The wire format is the TypeScript one (ADR 0014): camelCase names, ``from``
    where Python must say ``from_``, declaration order, and the optional members
    absent rather than null so a reader that predates them still parses the
    file. Pure — the writing is the shell's job.
    """

    def cell(c: CellFailure) -> dict:
        return {"from": c.from_, "to": c.to, "actual": c.actual}

    def failure(f: ExampleFailure) -> dict:
        out: dict = {"line": f.line, "message": f.message, "stack": f.stack}
        if f.cells:
            out["cells"] = [cell(c) for c in f.cells]
        if f.anchor is not None:
            out["anchor"] = {"from": f.anchor.from_, "to": f.anchor.to}
        if f.doc_path is not None:
            out["docPath"] = f.doc_path
        return out

    def example(e: ExampleResult) -> dict:
        out: dict = {"name": e.name, "status": e.status, "lines": list(e.lines)}
        if e.failure is not None:
            out["failure"] = failure(e.failure)
        return out

    out: dict = {
        "version": results.version,
        "oathPath": results.oath_path,
        "sourceHash": results.source_hash,
    }
    if results.documents:
        out["documents"] = [
            {"path": d.path, "sourceHash": d.source_hash} for d in results.documents
        ]
    out["examples"] = [example(e) for e in results.examples]
    return out

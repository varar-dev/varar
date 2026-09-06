"""results.py — persist run results for the language server (ADR 0014).

The shell half of the run-result contract: the core builds the payload, this
writes ``<root>/.varar/<oath_path>.json`` so the (language-neutral) LSP can turn
a failure into an editor diagnostic. Port of the TypeScript vitest reporter's
writing half; every adapter in this port feeds the same collector, so pytest and
unittest cannot drift from each other.
"""
from __future__ import annotations

import json
from pathlib import Path

from varar_core.hash import hash_source
from varar_core.result import ExampleResult, OathResults, to_wire


def result_file_path(root: Path, oath_path: str) -> Path:
    """``<root>/.varar/<oath_path>.json`` — the file the LSP watches."""
    return root / ".varar" / f"{oath_path}.json"


def write_oath_results(root: Path, results: OathResults) -> Path:
    """Write one oath's results. 2-space indent + trailing newline, matching
    ``JSON.stringify(results, null, 2)`` in the TypeScript port byte-for-byte —
    including leaving non-ASCII unescaped."""
    out = result_file_path(root, results.oath_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(to_wire(results), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return out


def _document_order(result: ExampleResult) -> tuple[int, str]:
    """Sort key putting examples in document order.

    A test framework reports examples in ITS order — unittest sorts by method
    name, minitest randomises, cargo runs in parallel — so the order results are
    recorded in is not the order they appear in the oath. The file is a
    cross-port contract read by tools that diff runs, so it is written in
    document order everywhere. Name breaks ties for examples sharing a line.
    """
    return (result.lines[0] if result.lines else 0, result.name)


class ResultsCollector:
    """Accumulates each oath's example results across a run, then writes them.

    A test framework hands back one example at a time and only says "the run is
    over" at the end, so the results for an oath cannot be written until then.
    Passing oaths are written too — a stale file would otherwise keep an
    already-fixed diagnostic on screen.
    """

    def __init__(self) -> None:
        self._sources: dict[str, str] = {}
        self._examples: dict[str, list[ExampleResult]] = {}

    def record(self, oath_path: str, source: str, result: ExampleResult) -> None:
        self._sources[oath_path] = source
        self._examples.setdefault(oath_path, []).append(result)

    def write_all(self, root: Path) -> list[Path]:
        written = []
        for oath_path, examples in self._examples.items():
            results = OathResults(
                version=1,
                oath_path=oath_path,
                source_hash=hash_source(self._sources[oath_path]),
                examples=tuple(sorted(examples, key=_document_order)),
            )
            written.append(write_oath_results(root, results))
        return written

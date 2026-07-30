"""The cross-port wire format of .varar/<oath_path>.json (ADR 0014).

Every port builds this same value; the parsed result must match — see
conformance/run-results/README.md for what that pins, and why
the bundle goldens don't cover it.
"""
from __future__ import annotations

import json
from pathlib import Path

from varar_core.result import (
    AnchorRange,
    CellFailure,
    ExampleFailure,
    ExampleResult,
    OathResults,
    to_wire,
)

EXPECTED = Path(__file__).resolve().parents[4] / "conformance/run-results/expected.json"

RESULTS = OathResults(
    version=1,
    oath_path="varar/library.md",
    source_hash="fnv1a:1622dfca",
    examples=(
        ExampleResult(
            name="Maya borrowed *Emma*, due back on June 1, 2026",
            status="passed",
            lines=(3, 4),
        ),
        ExampleResult(
            name="Ben borrowed *Dune* for £2.50 & kept it",
            status="failed",
            lines=(13, 14),
            failure=ExampleFailure(
                line=14,
                message="expected £2.50 but was £3.00\nand the library <refused>",
                stack="<stack>",
                cells=(CellFailure(from_=71, to=77, actual="£3.00"),),
                anchor=AnchorRange(from_=60, to=90),
            ),
        ),
        ExampleResult(
            name="Noor borrowed *Kindred*",
            status="failed",
            lines=(8, 9),
            failure=ExampleFailure(
                line=9, message="expected the library to refuse", stack="<stack>"
            ),
        ),
    ),
)


def test_the_wire_format_matches_the_cross_port_fixture() -> None:
    # By CONTENT: the file has to SAY the same thing in every port — field names,
    # the shapes, and an optional member absent rather than null.
    written = json.dumps(to_wire(RESULTS), indent=2, ensure_ascii=False) + "\n"
    assert json.loads(written) == json.loads(EXPECTED.read_text(encoding="utf-8"))

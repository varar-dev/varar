"""test_failure_step_span.py — port of typescript/packages/core/tests/failure-step-span.test.ts

A throwing sensor sharing its line with a stimulus that passed: the chain
(execute_plan → to_failure) must land on the sensor's own text, since a
renderer underlining the line would blame the stimulus too.
"""
from __future__ import annotations

from typing import Any

from varar_core.execute import ExecutePorts, execute_plan
from varar_core.failure import to_failure
from varar_core.failure_anchor import attach_failure_anchor, read_failure_anchor
from varar_core.parse import parse
from varar_core.plan import plan
from varar_core.registry import add_step, create_registry
from varar_core.span import span_from_offsets

SOURCE = "# L\n\nHe asks on June 10, and the library agrees.\n"
STEP_TEXT = "the library agrees"


def _failure() -> Any:
    r = create_registry()
    r = add_step(
        r,
        expression="asks on June 10",
        expression_source_file="s.py",
        expression_source_line=1,
        kind="stimulus",
        handler=lambda *_: None,
    )

    def boom(*_: Any) -> None:
        raise AssertionError("expected the library to refuse")

    r = add_step(
        r,
        expression=STEP_TEXT,
        expression_source_file="s.py",
        expression_source_line=2,
        kind="sensor",
        handler=boom,
    )
    p = plan(parse("l.md", SOURCE), r)

    runs: list[Any] = []

    class Sink:
        def example(self, name: str, run: Any, info: Any = None) -> None:
            runs.append(run)

    class Reporter:
        def diagnostic(self, d: Any) -> None:
            pass

    execute_plan(p, ExecutePorts(sink=Sink(), reporter=Reporter()))
    try:
        runs[0]()
    except Exception as error:  # noqa: BLE001 — the failure IS the subject
        return to_failure(error, "l.md", 3)
    raise AssertionError("the example was expected to fail")


def test_a_thrown_step_records_the_anchor_of_the_step_that_threw() -> None:
    f = _failure()
    assert f.anchor is not None
    assert SOURCE[f.anchor.from_ : f.anchor.to] == STEP_TEXT


def test_the_anchor_rides_on_the_error() -> None:
    err = AssertionError("boom")
    attach_failure_anchor(err, span_from_offsets(SOURCE, 5, 9))
    anchor = read_failure_anchor(err)
    assert anchor is not None
    assert anchor.start_offset == 5
    # Something raised without a writable __dict__ is ignored, not fatal.
    attach_failure_anchor("a string", span_from_offsets(SOURCE, 0, 1))
    assert read_failure_anchor("a string") is None

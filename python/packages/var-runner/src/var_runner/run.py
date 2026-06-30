from __future__ import annotations
from collections.abc import Callable
from typing import Any
from var.execute import CollectPorts, collect_examples
from var.parse import parse
from var.plan import ExecutionPlan, PlannedExample, plan
from var.registry import Registry

class RecordingReporter:
    def __init__(self) -> None:
        self.diagnostics: list[Any] = []
    def diagnostic(self, d: Any) -> None:
        self.diagnostics.append(d)

def plan_spec(source: str, path: str, registry: Registry) -> ExecutionPlan:
    return plan(parse(path, source), registry)

def examples_with_runs(
    execution_plan: ExecutionPlan,
    create_context: Callable[[str], Any],
    reporter: Any,
) -> tuple[tuple[PlannedExample, Callable[[], None]], ...]:
    queue = collect_examples(execution_plan, CollectPorts(reporter=reporter, create_context=create_context))
    # collect_examples preserves plan.examples order
    return tuple((ex, q.run) for ex, q in zip(execution_plan.examples, queue, strict=True))

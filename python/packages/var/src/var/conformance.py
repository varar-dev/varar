"""conformance.py — var-doc, registry, plan, and trace artifact projections.

Port of toVarDocArtifact, toRegistryArtifact, toPlanArtifact, toFailureArtifact,
and runConformance from typescript/packages/var-core/src/conformance.ts.
Serializes a VarDoc AST / Registry / ExecutionPlan / trace to the camelCase wire
dicts expected by the conformance golden files.
"""

from __future__ import annotations

import os
from typing import Any, Callable

from cucumber_expressions.expression import CucumberExpression

from var.ast import (
    Blockquote,
    Example,
    Fence,
    Heading,
    InlineOffset,
    ListItem,
    Paragraph,
    Row,
    Table,
    ThematicBreak,
    VarDoc,
)
from var.cell_diff import CellMismatchError, ReturnShapeError, is_cell_mismatch_error
from var.doc_string_diff import is_doc_string_mismatch_error
from var.execute import CollectPorts, StepObservation, collect_examples, is_unexpected_pass_error
from var.plan import ExecutionPlan
from var.plan import plan as build_plan
from var.registry import Registry
from var.span import Span, utf16_slice


# ---------------------------------------------------------------------------
# Registry artifact projection
# ---------------------------------------------------------------------------


def parameter_type_names(compiled: CucumberExpression) -> list[str]:
    """Return parameter-type names in source order from a compiled expression.

    Port of ``parameterTypeNames`` in conformance.ts.  The TS implementation
    walks ``compiled.ast`` collecting ``NodeType.parameter`` nodes; in Python
    ``CucumberExpression`` does not expose ``.ast``, but ``compiled.parameter_types``
    is populated in source order by ``rewrite_parameter`` during ``__init__``,
    giving identical results.
    """
    return [pt.name for pt in compiled.parameter_types]


def to_registry_artifact(
    registry: Registry,
    parameter_types: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Project a Registry to the camelCase wire dict for the registry artifact.

    Port of ``toRegistryArtifact`` from conformance.ts.
    """
    if parameter_types is None:
        parameter_types = []
    return {
        "steps": [
            {
                "expression": s.expression,
                "parameterTypeNames": parameter_type_names(s.compiled),
            }
            for s in registry.steps
        ],
        "parameterTypes": [
            {"name": p["name"], "regexp": p["regexp"]} for p in parameter_types
        ],
    }


def _span(s: Span) -> dict[str, Any]:
    return {
        "startOffset": s.start_offset,
        "endOffset": s.end_offset,
        "startLine": s.start_line,
        "startCol": s.start_col,
        "endLine": s.end_line,
        "endCol": s.end_col,
    }


def _inline(io: InlineOffset) -> dict[str, Any]:
    return {
        "textOffset": io.text_offset,
        "sourceOffset": io.source_offset,
    }


def _row(r: Row) -> dict[str, Any]:
    return {
        "cells": list(r.cells),
        "cellSpans": [_span(cs) for cs in r.cell_spans],
        "span": _span(r.span),  # type: ignore[arg-type]
    }


def _block(b: Heading | Paragraph | ListItem | Blockquote | Table | Fence | ThematicBreak) -> dict[str, Any]:
    if isinstance(b, Paragraph):
        return {
            "kind": b.kind,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
            "inlineMap": [_inline(io) for io in b.inline_map],
        }
    if isinstance(b, Heading):
        return {
            "kind": b.kind,
            "level": b.level,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
        }
    if isinstance(b, ListItem):
        return {
            "kind": b.kind,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
            "inlineMap": [_inline(io) for io in b.inline_map],
            "ordered": b.ordered,
            "markerSpan": _span(b.marker_span),  # type: ignore[arg-type]
        }
    if isinstance(b, Blockquote):
        return {
            "kind": b.kind,
            "text": b.text,
            "span": _span(b.span),  # type: ignore[arg-type]
            "inlineMap": [_inline(io) for io in b.inline_map],
        }
    if isinstance(b, Table):
        return {
            "kind": b.kind,
            "span": _span(b.span),  # type: ignore[arg-type]
            "header": _row(b.header),  # type: ignore[arg-type]
            "rows": [_row(r) for r in b.rows],
        }
    if isinstance(b, Fence):
        return {
            "kind": b.kind,
            "span": _span(b.span),  # type: ignore[arg-type]
            "info": b.info,
            "body": b.body,
            "bodySpan": _span(b.body_span),  # type: ignore[arg-type]
        }
    if isinstance(b, ThematicBreak):
        return {
            "kind": b.kind,
            "span": _span(b.span),  # type: ignore[arg-type]
        }
    raise TypeError(f"Unknown block type: {type(b)}")  # pragma: no cover


def _example(ex: Example) -> dict[str, Any]:
    return {
        "scopeStack": list(ex.scope_stack),
        "span": _span(ex.span),  # type: ignore[arg-type]
        "body": [_block(b) for b in ex.body],
    }


def to_var_doc_artifact(doc: VarDoc) -> dict[str, Any]:
    """Project a VarDoc to the camelCase wire dict for the var-doc artifact."""
    return {
        "path": doc.path,
        "examples": [_example(ex) for ex in doc.examples],
        "orphanAttachments": [_block(b) for b in doc.orphan_attachments],
    }


# ---------------------------------------------------------------------------
# Plan artifact projection
# ---------------------------------------------------------------------------


def _doc_string(ds: Any) -> dict[str, Any]:
    return {
        "content": ds.content,
        "contentType": ds.content_type,
        "span": _span(ds.span),
    }


def to_plan_artifact(execution_plan: ExecutionPlan) -> dict[str, Any]:
    """Project an ExecutionPlan to the camelCase wire dict for the plan artifact.

    Port of ``toPlanArtifact`` from conformance.ts.
    """
    source = execution_plan.var_doc.source

    def _step(step: Any) -> dict[str, Any]:
        step_names = parameter_type_names(step.step_def.compiled)
        result: dict[str, Any] = {
            "text": step.text,
            "matchSpan": _span(step.match_span),
            "paramSpans": [_span(s) for s in step.param_spans],
            "matchedExpression": step.step_def.expression,
            "args": [
                {
                    "value": utf16_slice(source, s.start_offset, s.end_offset),
                    "parameterType": step_names[i] if i < len(step_names) else None,
                }
                for i, s in enumerate(step.param_spans)
            ],
        }
        if step.data_table is not None:
            result["dataTable"] = _block(step.data_table)
        if step.doc_string is not None:
            result["docString"] = _doc_string(step.doc_string)
        return result

    def _planned_example(ex: Any) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": ex.name,
            "scopeStack": list(ex.scope_stack),
            "span": _span(ex.span),
            "expectedOutcome": ex.expected_outcome if ex.expected_outcome is not None else "pass",
        }
        if ex.expected_error_message is not None:
            result["expectedErrorMessage"] = ex.expected_error_message
        result["steps"] = [_step(s) for s in ex.steps]
        return result

    return {
        "examples": [_planned_example(ex) for ex in execution_plan.examples],
        "diagnostics": [
            {
                "code": d.code,
                "severity": d.severity,
                "span": _span(d.span),
            }
            for d in execution_plan.diagnostics
        ],
    }


# ---------------------------------------------------------------------------
# Trace artifact projection
# ---------------------------------------------------------------------------


def _file_stem(path: str) -> str:
    """Return the file stem: ``path/to/foo.steps.py`` -> ``foo.steps``.

    Port of ``fileStem`` from conformance.ts.  Strips the final extension so
    that ``foo.steps.py`` becomes ``foo.steps`` and ``foo.py`` becomes ``foo``.
    """
    base = os.path.basename(path)
    # Strip the last extension only (same as TS: base.replace(/\\.[^.]+$/, ''))
    stem, _ext = os.path.splitext(base)
    return stem


def to_failure_artifact(error: object, line: int) -> dict[str, Any]:
    """Project an execution error to a FailureArtifact dict.

    Port of ``toFailureArtifact`` from conformance.ts.
    ``line`` is the failing step's ``match_span.start_line`` (1-based).
    """
    if is_cell_mismatch_error(error):
        assert isinstance(error, CellMismatchError)
        return {
            "kind": "cell-mismatch",
            "line": line,
            "cells": [
                {
                    "column": c.column,
                    "expected": c.expected,
                    "actual": c.actual,
                    "span": _span(c.span),
                }
                for c in error.cells
                if not c.ok
            ],
        }
    if is_doc_string_mismatch_error(error):
        from var.doc_string_diff import DocStringMismatchError
        assert isinstance(error, DocStringMismatchError)
        return {
            "kind": "doc-string-mismatch",
            "line": line,
            "diff": {
                "expected": error.diff.expected,
                "actual": error.diff.actual,
                "span": _span(error.diff.span),
            },
        }
    if isinstance(error, ReturnShapeError):
        return {"kind": "return-shape", "line": line}
    if is_unexpected_pass_error(error):
        return {"kind": "unexpected-pass", "line": line}
    return {"kind": "thrown", "line": line}


def run_conformance(
    var_doc: VarDoc,
    registry: Registry,
    create_context: Callable[[str], Any],
    parameter_types: tuple[dict[str, str], ...] = (),
) -> dict[str, Any]:
    """Run all examples and return the four-artifact bundle dict.

    Port of ``runConformance`` from conformance.ts.
    Returns ``{"varDoc", "registry", "plan", "trace"}``.
    """
    execution = build_plan(var_doc, registry)

    # Accumulate step observations keyed by example index.
    observed: dict[int, list[StepObservation]] = {}

    class _RecordingObserver:
        def step(self, o: StepObservation) -> None:
            lst = observed.setdefault(o.example_index, [])
            lst.append(o)

    class _NullReporter:
        def diagnostic(self, _d: Any) -> None:
            pass

    queue = collect_examples(
        execution,
        CollectPorts(
            reporter=_NullReporter(),
            create_context=create_context,
            observer=_RecordingObserver(),
        ),
    )

    trace_examples = []
    for k, queued in enumerate(queue):
        outcome: str = "pass"
        try:
            queued.run()
        except Exception:
            outcome = "fail"

        planned = execution.examples[k]
        obs_list = observed.get(k, [])

        steps = []
        for i, step in enumerate(planned.steps):
            # Select the fail observation if any, else the last; skipped if none.
            ordinal = i + 1
            matches = [x for x in obs_list if x.ordinal == ordinal]
            o = next((m for m in matches if m.outcome == "fail"), None)
            if o is None and matches:
                o = matches[-1]

            step_outcome: str = o.outcome if o is not None else "skipped"
            step_dict: dict[str, Any] = {
                "exampleName": queued.name,
                "ordinal": ordinal,
                "stepText": step.text,
                "matchedExpression": step.step_def.expression,
                "contextKey": {
                    "exampleName": queued.name,
                    "stepFile": _file_stem(step.step_def.expression_source_file),
                },
                "outcome": step_outcome,
            }
            if step_outcome == "fail":
                step_dict["failure"] = to_failure_artifact(
                    o.error if o is not None else None,
                    step.match_span.start_line,
                )
            steps.append(step_dict)

        trace_examples.append({"name": queued.name, "outcome": outcome, "steps": steps})

    return {
        "varDoc": to_var_doc_artifact(var_doc),
        "registry": to_registry_artifact(registry, list(parameter_types)),
        "plan": to_plan_artifact(execution),
        "trace": {"examples": trace_examples},
    }

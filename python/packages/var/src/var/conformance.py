"""conformance.py — var-doc artifact projection.

Port of toVarDocArtifact from typescript/packages/var-core/src/conformance.ts.
Serializes a VarDoc AST to the camelCase wire dict expected by the conformance
golden files.
"""

from __future__ import annotations

from typing import Any

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
from var.span import Span


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

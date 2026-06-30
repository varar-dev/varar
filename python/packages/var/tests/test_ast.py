import pytest
from dataclasses import FrozenInstanceError
from var.span import span_from_offsets
from var.ast import Paragraph, InlineOffset, VarDoc


def test_nodes_construct_and_are_frozen():
    p = Paragraph(
        kind="paragraph",
        text="hi",
        span=span_from_offsets("hi", 0, 2),
        inline_map=(InlineOffset(0, 0),),
    )
    assert p.text == "hi" and p.kind == "paragraph"
    with pytest.raises(FrozenInstanceError):
        p.text = "no"  # type: ignore[misc]


def test_vardoc_holds_examples():
    d = VarDoc(path="example.md", source="", examples=(), orphan_attachments=())
    assert d.path == "example.md" and d.examples == ()

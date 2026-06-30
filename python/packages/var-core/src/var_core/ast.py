from __future__ import annotations

from dataclasses import dataclass
from typing import Union

from var_core.span import Span


@dataclass(frozen=True, slots=True)
class InlineOffset:
    text_offset: int
    source_offset: int


@dataclass(frozen=True, slots=True)
class Heading:
    kind: str = "heading"
    level: int = 0
    text: str = ""
    span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class Paragraph:
    kind: str = "paragraph"
    text: str = ""
    span: Span | None = None
    inline_map: tuple[InlineOffset, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class ListItem:
    kind: str = "list_item"
    text: str = ""
    span: Span | None = None
    inline_map: tuple[InlineOffset, ...] = ()
    ordered: bool = False
    marker_span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")
        if self.marker_span is None:
            raise TypeError("marker_span is required")


@dataclass(frozen=True, slots=True)
class Blockquote:
    kind: str = "blockquote"
    text: str = ""
    span: Span | None = None
    inline_map: tuple[InlineOffset, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class Row:
    cells: tuple[str, ...] = ()
    cell_spans: tuple[Span, ...] = ()
    span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class Table:
    kind: str = "table"
    span: Span | None = None
    header: Row | None = None
    rows: tuple[Row, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")
        if self.header is None:
            raise TypeError("header is required")


@dataclass(frozen=True, slots=True)
class Fence:
    kind: str = "fence"
    span: Span | None = None
    info: str = ""
    body: str = ""
    body_span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")
        if self.body_span is None:
            raise TypeError("body_span is required")


@dataclass(frozen=True, slots=True)
class ThematicBreak:
    kind: str = "thematic_break"
    span: Span | None = None

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


Block = Union[Heading, Paragraph, ListItem, Blockquote, Table, Fence, ThematicBreak]


@dataclass(frozen=True, slots=True)
class Example:
    scope_stack: tuple[str, ...] = ()
    span: Span | None = None
    body: tuple[Block, ...] = ()

    def __post_init__(self) -> None:
        if self.span is None:
            raise TypeError("span is required")


@dataclass(frozen=True, slots=True)
class VarDoc:
    path: str = ""
    source: str = ""
    examples: tuple[Example, ...] = ()
    orphan_attachments: tuple[Union[Table, Fence], ...] = ()

"""reference.py — port of typescript/packages/core/src/reference.ts.

Reuse is a link (ADR 0016). A candidate block whose entire content is a single
Markdown link to an oath section is a REFERENCE BLOCK: it splices that section's
steps in at its own position instead of being prose.

Everything here is pure text and path arithmetic — no filesystem. The shell
reads the documents; ``references()`` tells it which ones to read, and
``build_workspace()`` turns the collection into what ``plan()`` needs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from varar_core.ast import Doc, Example


@dataclass(frozen=True, slots=True)
class Reference:
    # The referenced oath's path, resolved against the referring doc's own path.
    # Equal to the referring doc's path for a same-file ``#fragment`` link.
    path: str
    # The GFM slug of the heading being referenced, or '' for a whole-file link.
    slug: str
    # The link's visible text, as written.
    text: str


# A candidate is a reference block iff its whole text is one Markdown link whose
# target is oath-shaped. Anything else — a link with surrounding words, a link to
# https://…, to a .ts file, to a mailto: — is ordinary content, so existing
# documents keep their meaning.
_LINK_ONLY = re.compile(r"^\[([^\]]*)\]\(\s*([^\s)]+)\s*\)$")
_PROTOCOL = re.compile(r"^[a-z][a-z0-9+.\-]*:", re.IGNORECASE)
_NOT_SLUG = re.compile(r"[^\w \-]", re.UNICODE)


def reference_of(text: str, from_path: str) -> Reference | None:
    m = _LINK_ONLY.match(text.strip())
    if m is None:
        return None
    link_text, target = m.group(1), m.group(2)
    if target.startswith("#"):
        return Reference(path=from_path, slug=_normalize_slug(target[1:]), text=link_text)
    hash_at = target.find("#")
    file_part = target if hash_at == -1 else target[:hash_at]
    fragment = "" if hash_at == -1 else target[hash_at + 1 :]
    # Only a relative Markdown path is a reference. A protocol (https:, mailto:)
    # or any other extension is left alone — remote references are deliberately
    # out of scope (ADR 0016).
    if not file_part.endswith(".md") or _PROTOCOL.match(file_part):
        return None
    if file_part.startswith("/"):
        return None
    return Reference(
        path=join_posix(_dirname_posix(from_path), file_part),
        slug=_normalize_slug(fragment),
        text=link_text,
    )


def slugify(heading_text: str) -> str:
    """GitHub's heading anchors: inline markup dropped, lowercased, spaces to
    hyphens, everything else that isn't a word character or hyphen removed. The
    same function produces the slug of a heading and normalizes the slug written
    in a link, so the two meet in the middle."""
    stripped = re.sub(r"`([^`]*)`", r"\1", heading_text)
    stripped = re.sub(r"\*\*([^*]*)\*\*", r"\1", stripped)
    stripped = re.sub(r"\*([^*]*)\*", r"\1", stripped)
    stripped = re.sub(r"_([^_]*)_", r"\1", stripped)
    return _normalize_slug(stripped)


def _normalize_slug(s: str) -> str:
    # One hyphen per space, not per run of them: GitHub leaves the gap where it
    # dropped punctuation, so "Fees, VAT & rounding" slugs with a double hyphen.
    return _NOT_SLUG.sub("", s.strip().lower()).replace(" ", "-")


def _dirname_posix(path: str) -> str:
    i = path.rfind("/")
    return "" if i == -1 else path[:i]


def join_posix(directory: str, rel: str) -> str:
    """POSIX path arithmetic on oath paths (always '/'-separated, relative to
    the workspace root). The core may not depend on a filesystem module."""
    segments = [] if directory == "" else directory.split("/")
    for segment in rel.split("/"):
        if segment in ("", "."):
            continue
        if segment != "..":
            segments.append(segment)
        # A `..` with nothing left to climb out of stays: an oath above the
        # workspace root is addressed as `../shared/b.md` (to_oath_path keeps
        # the leading `../` too), and clamping it would point at the wrong file.
        elif segments and segments[-1] != "..":
            segments.pop()
        else:
            segments.append("..")
    return "/".join(segments)


def references(doc: Doc) -> tuple[Reference, ...]:
    """Every reference block in a document, in document order. The shell uses
    this to walk the closure of documents it must read before planning."""
    out: list[Reference] = []
    for ex in doc.examples:
        primary = ex.body[0] if ex.body else None
        text = getattr(primary, "text", None)
        if text is None:
            continue
        ref = reference_of(text, doc.path)
        if ref is not None:
            out.append(ref)
    return tuple(out)


@dataclass(frozen=True, slots=True)
class OathWorkspace:
    """What ``plan()`` needs to resolve references: every oath by path, plus
    which sections are consumed by a reference somewhere in the project. A
    section that is referenced stops being a standalone example, so this is
    whole-project knowledge — see ADR 0016 on why each runner builds it at its
    once-per-run discovery pass."""

    docs: dict[str, Doc] = field(default_factory=dict)
    # ``f"{path}#{slug}"`` for every referenced section; a whole-file reference
    # is recorded as ``f"{path}#"``.
    referenced: frozenset[str] = frozenset()


def section_key(path: str, slug: str) -> str:
    return f"{path}#{slug}"


def empty_workspace() -> OathWorkspace:
    """The workspace with no references at all: what a caller planning a single
    document in isolation passes."""
    return OathWorkspace(docs={}, referenced=frozenset())


def build_workspace(docs: tuple[Doc, ...] | list[Doc]) -> OathWorkspace:
    by_path = {doc.path: doc for doc in docs}
    referenced: set[str] = set()
    for doc in docs:
        for ref in references(doc):
            referenced.add(section_key(ref.path, ref.slug))
    return OathWorkspace(docs=by_path, referenced=frozenset(referenced))


def section_candidates(doc: Doc, slug: str) -> tuple[Example, ...]:
    """The candidates that make up a section: those whose heading chain contains
    the slug. A whole-file reference ('' slug) is every candidate in the
    document. Section membership follows the document outline exactly — a
    heading's section runs until the next heading of the same or higher level,
    which is precisely the range over which that heading stays on the scope
    stack."""
    if slug == "":
        return tuple(doc.examples)
    return tuple(
        ex for ex in doc.examples if any(slugify(h) == slug for h in ex.scope_stack)
    )

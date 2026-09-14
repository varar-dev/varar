"""test_reference.py — port of typescript/packages/core/tests/reference.test.ts
(the path-arithmetic part)."""
from __future__ import annotations

from varar_core.parse import parse
from varar_core.reference import references


def test_a_link_that_climbs_above_the_workspace_root_keeps_its_leading_dotdot() -> None:
    # to_oath_path keeps `../` for an oath outside the root; the resolver must
    # too, or `../../shared/b.md` from `varar/a.md` would land on `shared/b.md`.
    doc = parse("varar/a.md", "[Up](../../shared/b.md#setup)\n")
    assert references(doc)[0].path == "../shared/b.md"
    deeper = parse("../outside/a.md", "[Up](../b.md)\n")
    assert references(deeper)[0].path == "../b.md"

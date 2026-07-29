"""parse.py — port of typescript/packages/core/src/parse.ts.

Combines scan + structure into the top-level parse function.
"""

from __future__ import annotations

from varar_core.ast import Doc
from varar_core.scanner import scan
from varar_core.structurer import structure


def parse(path: str, source: str) -> Doc:
    """Parse *source* into a Doc: scan blocks then group them into Examples."""
    return structure(path, source, scan(source))

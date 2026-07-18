"""baseline_store.py — the Node/CLI-equivalent filesystem BaselineStore.

The committed drift baseline lives at the project root as varar.lock.json. The
core owns the format; this adapter only reads and writes the raw text.
"""
from __future__ import annotations

from pathlib import Path


class FileBaselineStore:
    def __init__(self, root: Path | str) -> None:
        self._path = Path(root) / "varar.lock.json"

    def read(self) -> str | None:
        return self._path.read_text(encoding="utf-8") if self._path.exists() else None

    def write(self, contents: str) -> None:
        self._path.write_text(contents, encoding="utf-8")


def create_file_baseline_store(root: Path | str) -> FileBaselineStore:
    return FileBaselineStore(root)

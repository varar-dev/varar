from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

_KNOWN_KEYS = {"$schema", "docs", "steps", "snippets", "scannerPlugins"}
_KNOWN_DOCS_KEYS = {"include", "exclude"}


@dataclass(frozen=True, slots=True)
class VarConfig:
    docs_include: tuple[str, ...] = ()
    docs_exclude: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    snippets: Mapping[str, str] = field(default_factory=dict)
    scanner_plugins: tuple[str, ...] = ()


def _string_tuple(value: object, key: str, source: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError(f"{source}: '{key}' must be an array of strings")
    return tuple(value)


def parse_var_config(text: str, source: str) -> VarConfig:
    """Parse ``var.config.json`` ``text`` — a pure function, no file I/O.

    ``source`` labels every error message (typically the originating file
    path). Mirrors TypeScript's ``parseVarConfig(jsonText, sourcePath)`` and
    Java's ``VarConfig.parse(String, String)``: the file-reading edge lives in
    :func:`read_var_config`, this is the functional core.

    Malformed JSON, wrong types, or unknown keys -> ``ValueError`` starting
    with ``source`` — a typo'd config must fail loudly, never silently discover
    nothing. See conformance/config/README.md for the shared rules.
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"{source}: invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{source}: top level must be an object")
    unknown = set(data) - _KNOWN_KEYS
    if unknown:
        raise ValueError(f"{source}: unknown key(s): {', '.join(sorted(unknown))}")
    docs = data.get("docs")
    if docs is None:
        docs = {}
    if not isinstance(docs, dict):
        raise ValueError(f"{source}: 'docs' must be an object")
    unknown_docs = set(docs) - _KNOWN_DOCS_KEYS
    if unknown_docs:
        raise ValueError(f"{source}: unknown docs key(s): {', '.join(sorted(unknown_docs))}")
    snippets = data.get("snippets")
    if snippets is None:
        snippets = {}
    if not isinstance(snippets, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in snippets.items()
    ):
        raise ValueError(f"{source}: 'snippets' must be an object of strings")
    return VarConfig(
        docs_include=_string_tuple(docs.get("include"), "docs.include", source),
        docs_exclude=_string_tuple(docs.get("exclude"), "docs.exclude", source),
        steps=_string_tuple(data.get("steps"), "steps", source),
        snippets=dict(snippets),
        scanner_plugins=_string_tuple(data.get("scannerPlugins"), "scannerPlugins", source),
    )


def read_var_config(root: str | Path) -> VarConfig:
    """Read ``<root>/var.config.json`` and parse it via :func:`parse_var_config`.

    Missing file -> empty config (tools no-op; matches every other port). All
    parsing/validation is delegated to the pure :func:`parse_var_config`; this
    function is the imperative shell that only touches the filesystem.
    """
    path = Path(root) / "var.config.json"
    if not path.is_file():
        return VarConfig()
    return parse_var_config(path.read_text(encoding="utf-8"), str(path))

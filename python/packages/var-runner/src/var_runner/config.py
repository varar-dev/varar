from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class VarConfig:
    vars_include: tuple[str, ...] = ()
    vars_exclude: tuple[str, ...] = ()
    steps: tuple[str, ...] = ()
    scanner_plugins: tuple[str, ...] = ()


def read_var_config(pyproject_path: str | Path) -> VarConfig:
    # A missing pyproject.toml (or one without [tool.var]) means "no specs" — the
    # plugin must no-op, never crash. var-pytest is auto-active in ANY pytest
    # project via its pytest11 entry point, so it can be loaded where no config
    # exists (e.g. rootdir resolved to a directory with no pyproject.toml).
    path = Path(pyproject_path)
    if not path.is_file():
        return VarConfig()
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    tool_var = data.get("tool", {}).get("var", {})
    vars_field = tool_var.get("vars", {})
    if isinstance(vars_field, list):
        include, exclude = tuple(vars_field), ()
    else:
        include = tuple(vars_field.get("include", []))
        exclude = tuple(vars_field.get("exclude", []))
    return VarConfig(
        vars_include=include,
        vars_exclude=exclude,
        steps=tuple(tool_var.get("steps", [])),
        scanner_plugins=tuple(tool_var.get("scanner_plugins", [])),
    )

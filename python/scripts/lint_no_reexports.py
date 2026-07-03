#!/usr/bin/env python3
"""Architecture gate: a package must never re-export another package's API.

Consumers import each package's names from the package that defines them --
re-exports create parallel import paths, hide real dependencies, and grow the
public API surface beyond the minimum. The TypeScript workspace enforces the
same rule via typescript/scripts/lint-no-reexports.mjs.

Two forms are rejected in packages/*/src:
  1. a name imported from another workspace package listed in ``__all__``
  2. a name imported from another workspace package in an ``__init__.py``
     but never used there (importing alone re-exposes it as a package
     attribute)

Imports from a package's own modules are the normal way it assembles its
public surface and are allowed.
"""

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = ROOT / "packages"


def workspace_import_names() -> set[str]:
    names = set()
    for pkg in sorted(PACKAGES.iterdir()):
        src = pkg / "src"
        if not src.is_dir():
            continue
        names.update(child.name for child in src.iterdir() if child.is_dir())
    return names


def foreign_imports(tree: ast.Module, own: str, workspace: set[str]) -> dict[str, tuple[str, int]]:
    """Local binding name -> (source package, line) for cross-package imports."""
    bindings: dict[str, tuple[str, int]] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            top = node.module.split(".")[0]
            if top in workspace and top != own:
                for alias in node.names:
                    bindings[alias.asname or alias.name] = (top, node.lineno)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top in workspace and top != own:
                    bindings[alias.asname or top] = (top, node.lineno)
    return bindings


def dunder_all_names(tree: ast.Module) -> dict[str, int]:
    names: dict[str, int] = {}
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else []
        if any(isinstance(t, ast.Name) and t.id == "__all__" for t in targets):
            for element in ast.walk(node.value):
                if isinstance(element, ast.Constant) and isinstance(element.value, str):
                    names[element.value] = element.lineno
    return names


def used_names(tree: ast.Module) -> set[str]:
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}


def check_file(path: Path, own: str, workspace: set[str]) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    foreign = foreign_imports(tree, own, workspace)
    if not foreign:
        return []
    rel = path.relative_to(ROOT)
    violations = []
    exported = dunder_all_names(tree)
    flagged = set()
    for name, line in sorted(exported.items(), key=lambda kv: kv[1]):
        if name in foreign:
            violations.append(f"{rel}:{line} __all__ re-exports '{name}' from '{foreign[name][0]}'")
            flagged.add(name)
    if path.name == "__init__.py":
        used = used_names(tree)
        for name, (source, line) in sorted(foreign.items(), key=lambda kv: kv[1][1]):
            if name not in used and name not in flagged:
                violations.append(
                    f"{rel}:{line} unused import re-exposes '{name}' from '{source}'"
                )
    return violations


def main() -> int:
    workspace = workspace_import_names()
    violations = []
    for pkg in sorted(PACKAGES.iterdir()):
        src = pkg / "src"
        if not src.is_dir():
            continue
        for top in sorted(src.iterdir()):
            if not top.is_dir():
                continue
            for module in sorted(top.rglob("*.py")):
                violations.extend(check_file(module, top.name, workspace))
    if violations:
        print("\n".join(violations), file=sys.stderr)
        print(
            f"\n{len(violations)} cross-package re-export(s). Packages must not re-export "
            "another package's API -- consumers import it from the defining package instead.",
            file=sys.stderr,
        )
        return 1
    print("no cross-package re-exports")
    return 0


if __name__ == "__main__":
    sys.exit(main())

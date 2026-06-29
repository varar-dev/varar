# Python implementation (skeleton)

uv workspace for the Python port of `var` (ADR 0001, issue #2). Today this is
empty scaffolding proving the toolchain; the runtime port lands separately.

```sh
uv sync          # create .venv, install workspace members + dev deps
uv run pytest    # run tests
uv run ruff check
```

Packages: `var` (pure core, import name `var`), `var-pytest` (pytest plugin,
distribution `pytest-var`), `var-unittest` (unittest adapter).

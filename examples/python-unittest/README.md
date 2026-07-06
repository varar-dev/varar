# Vár sample: Python + unittest

A small, standalone sample project that runs Markdown specs as tests with
[Vár](https://var.oselvar.com), using the `oselvar-var-unittest` adapter —
nothing but the standard library's test runner. Copy it as the starting
point for your own project.

The `.md` files at the project root are the specs — they run as tests.

## Run it

```sh
uv run python -m unittest
```

Each example in the Markdown specs becomes one unittest test.
[`test_var.py`](test_var.py) is the entire integration — a two-line module
that generates one `TestCase` per spec, which plain `python -m unittest`
(or any unittest-compatible runner) then discovers like hand-written tests.

## How it fits together

- **`var.config.json`** is the single source of truth: `docs.include` globs
  the Markdown specs and `steps` globs the step-definition files.
- **`steps/*.steps.py`** define the steps with `define_state` +
  `@stimulus`/`@sensor`. A stimulus returns the next state, a sensor returns
  a value for Vár to compare against what the Markdown says.
- **`src/yahtzee_example/`** is the sample's domain code — an ordinary
  installable package the steps import, just like your production code.

## Versioning note

The Vár Python packages are not on PyPI yet, so `[tool.uv.sources]` in
`pyproject.toml` resolves them from source: path sources in the
`oselvar/var` monorepo (gating trunk), rewritten by the release sync to
git+tag sources in `oselvar/var-examples`. Once they're published, that
table disappears — the plain `oselvar-var-unittest` dependency is all a
real project needs.

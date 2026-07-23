# Varar sample: Python + pytest

A small, standalone sample project that runs Markdown oaths as tests with
[Varar](https://varar.dev), using the `pytest-varar` plugin. Copy it as the
starting point for your own project.

The `.md` files in the `varar/` directory are the oaths — they run as tests.

## Run it

```sh
uv run pytest
```

Each example in the Markdown oaths becomes one pytest test. No conftest.py
and no test files are needed — installing `pytest-varar` is the entire
integration.

## How it fits together

- **`varar.config.json`** is the single source of truth: `docs.include` globs
  the Markdown oaths and `steps` globs the step-definition files.
- **`tests/varar/*.steps.py`** define the steps with `steps` +
  `@stimulus`/`@sensor`. A stimulus returns the next state, a sensor returns
  a value for Varar to compare against what the Markdown says.
- **`src/yahtzee_example/`** is the sample's domain code — an ordinary
  installable package the steps import, just like your production code.

## Versioning note

In the [varar-dev/varar](https://github.com/varar-dev/varar) monorepo this sample
resolves the Varar packages from `[tool.uv.sources]` path sources, gating
trunk against the local build. The release sync to
[varar-dev/varar-examples](https://github.com/varar-dev/varar-examples) deletes
that table and pins the released PyPI version — there, the plain
`pytest-varar` dependency is all a real project needs.

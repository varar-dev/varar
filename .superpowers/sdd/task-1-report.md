# Task 1 Report: Extract var-core Engine Package (Python)

## Status: DONE

**Commit:** `441d015`

---

## What was done

### Scaffold
- Created `python/packages/var-core/pyproject.toml` and `src/var_core/__init__.py`
- Added `oselvar-var-core = { workspace = true }` to `python/pyproject.toml` `[tool.uv.sources]`
- Added `oselvar-var-core` to `python/packages/var/pyproject.toml` dependencies

### Module moves (git mv, history preserved)
All 22 engine modules moved from `python/packages/var/src/var/<mod>.py` → `python/packages/var-core/src/var_core/<mod>.py` via `git mv`. All 17 engine unit tests (all `test_*.py` except `test_define_state.py`, `test_conformance.py`, `test_smoke.py`) moved to `python/packages/var-core/tests/`.

`test_smoke.py` was intentionally kept in `var/tests` — it tests `var.__version__` (the facade package), not any engine module, and would create a circular dependency if moved to var-core.

### Import rewrite approach
Used `perl -i -pe` with an alternation over the 22 engine module names to rewrite `from var.<enginemod>` → `from var_core.<enginemod>` in:
- All moved engine modules in `var_core/`
- All moved tests in `var-core/tests/`
- `python/packages/var/src/var/define_state.py` (registry + step_role imports only)
- `python/packages/var/tests/test_conformance.py` (canonical_json, conformance, parse, plan → var_core; define_state stays as `from var.define_state`)
- `python/packages/var-runner/src/var_runner/render.py`, `run.py` (engine imports)
- `python/packages/var-pytest/src/var_pytest/fixtures.py` (registry import)
- `python/packages/var-runner/tests/test_render.py` (engine imports)

One non-top-level import was missed by the `^`-anchored regex: an inline `from var.doc_string_diff import DocStringDiff` inside a test function in `test_doc_string_diff.py` — fixed with a targeted edit.

`grep -rn "from var\b\|import var\b" python/packages/var-core/src` returns nothing (clean).

### Deviation from brief
The brief's list of files to update did not include `var-runner` and `var-pytest` source and test files, but those packages also import engine modules directly. Updating them was required to make the test suite pass.

## Verification output

```
uv run pytest -q
262 passed in 0.45s

uv run pytest -k conformance -q
48 passed, 214 deselected in 0.10s

uv run ruff check
All checks passed!
```

## Git history check

```
git log --follow --oneline -3 -- python/packages/var-core/src/var_core/parse.py
441d015 refactor(py): extract var-core engine package from var
ac08c71 feat(py): structurer + parse
```

History resolves through the rename.

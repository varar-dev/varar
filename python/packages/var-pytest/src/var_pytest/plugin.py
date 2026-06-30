from __future__ import annotations

from pathlib import Path

import pytest

from var_runner.config import read_var_config
from var_runner.discovery import match_spec
from var_runner.run import RecordingReporter, examples_with_runs, plan_spec
from var_runner.steps import load_steps

_STASH: dict = {}  # keyed by config id → (VarConfig, LoadedSteps, root)


def pytest_configure(config: pytest.Config) -> None:
    root = Path(config.rootpath)
    cfg = read_var_config(root / "pyproject.toml")
    loaded = load_steps(cfg.steps, root)
    _STASH[id(config)] = (cfg, loaded, root)


def pytest_unconfigure(config: pytest.Config) -> None:
    _STASH.pop(id(config), None)


def pytest_collect_file(file_path: Path, parent: pytest.Collector):
    if file_path.suffix != ".md":
        return None
    cfg, _loaded, root = _STASH[id(parent.config)]
    if not match_spec(file_path, cfg.vars_include, cfg.vars_exclude, root):
        return None
    return VarFile.from_parent(parent, path=file_path)


class VarFile(pytest.File):
    def collect(self):
        _cfg, loaded, _root = _STASH[id(self.config)]
        source = self.path.read_text(encoding="utf-8")
        execution_plan = plan_spec(source, self.path.name, loaded.registry)
        pairs = examples_with_runs(execution_plan, loaded.create_context, RecordingReporter())
        for example, run in pairs:
            # Use the innermost heading (scope_stack[-1]) as the item name so
            # pytest displays "## adds two" as "adds two"; fall back to the
            # body-derived name when there is no scope.
            name = example.scope_stack[-1] if example.scope_stack else example.name
            yield VarItem.from_parent(self, name=name, example=example, run=run, source=source)


class VarItem(pytest.Item):
    def __init__(self, *, example, run, source, **kw):
        super().__init__(**kw)
        self._example = example
        self._run = run
        self._source = source

    def runtest(self) -> None:
        self._run()

    def reportinfo(self):
        return self.path, self._example.span.start_line - 1, self.name

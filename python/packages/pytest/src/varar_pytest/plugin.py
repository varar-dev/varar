from __future__ import annotations

import dataclasses
import os
from pathlib import Path

import pytest

from varar_config import read_config
from varar_core.diagnostics import drift_detected
from varar_core.drift import prune_baselines, reconcile_drift
from varar_core.failure import to_failure
from varar_core.result import ExampleResult
from varar_runner.baseline_store import create_file_baseline_store
from varar_runner.discovery import find_oaths, match_oath
from varar_runner.results import ResultsCollector
from varar_runner.run import RecordingReporter, examples_with_runs, plan_oath
from varar_runner.steps import load_steps
from varar_pytest.fixtures import _active_request, get_active_request, wrap_registry_for_fixtures

_STASH: dict = {}  # keyed by config id → (Config, LoadedSteps, root, store, results)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--varar-update",
        action="store_true",
        default=False,
        help="Accept drift and re-record varar.lock.json (also via VARAR_UPDATE=1).",
    )


def _update_mode(config: pytest.Config) -> bool:
    if config.getoption("--varar-update", default=False):
        return True
    return os.environ.get("VARAR_UPDATE") in ("1", "true")


def pytest_configure(config: pytest.Config) -> None:
    root = Path(config.rootpath)
    cfg = read_config(root)
    loaded = load_steps(cfg.steps, root)
    wrapped_registry = wrap_registry_for_fixtures(loaded.registry, get_active_request)
    loaded = dataclasses.replace(loaded, registry=wrapped_registry)
    store = create_file_baseline_store(root)
    _STASH[id(config)] = (cfg, loaded, root, store, ResultsCollector())

    # Drop baselines for oaths the config no longer discovers. Reconciliation is
    # per-oath and never sees a path that has gone, so the lock would otherwise
    # accumulate dead entries forever (#70). Once per run, here rather than in
    # OathFile.collect, and keyed off the config globs — NOT the files pytest
    # happened to collect, since `pytest tests/one_dir/` is a filtered view and
    # pruning against it would delete live baselines.
    prune_baselines(
        store,
        [p.relative_to(root).as_posix() for p in find_oaths(cfg.docs_include, cfg.docs_exclude, root)],
        update=_update_mode(config),
    )


def pytest_sessionfinish(session: pytest.Session) -> None:
    """Persist every oath's results for the language server (ADR 0014).

    End of run is the first moment an oath's examples are all in, and the file
    is written whether they passed or failed — a stale one would keep a
    diagnostic on screen that the run has just cleared.
    """
    stashed = _STASH.get(id(session.config))
    if stashed is None:
        return
    _cfg, _loaded, root, _store, results = stashed
    results.write_all(root)


def pytest_unconfigure(config: pytest.Config) -> None:
    _STASH.pop(id(config), None)


def _oath_path(path: Path, root: Path) -> str:
    """The oath's POSIX path relative to the workspace root — its identity in
    varar.lock.json and in .varar/<oath_path>.json alike."""
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.name


def pytest_collect_file(file_path: Path, parent: pytest.Collector):
    if file_path.suffix != ".md":
        return None
    cfg, _loaded, root, _store, _results = _STASH[id(parent.config)]
    if not match_oath(file_path, cfg.docs_include, cfg.docs_exclude, root):
        return None
    return OathFile.from_parent(parent, path=file_path)


class OathFile(pytest.File):
    def collect(self):
        _cfg, loaded, root, store, results = _STASH[id(self.config)]
        source = self.path.read_text(encoding="utf-8")
        execution_plan = plan_oath(self.path.name, source, loaded.registry)
        pairs = examples_with_runs(execution_plan, loaded.create_context, RecordingReporter())
        seen: dict[str, int] = {}
        for example, run in pairs:
            # Use the innermost heading (scope_stack[-1]) as the item name so
            # pytest displays "## adds two" as "adds two"; fall back to the
            # body-derived name when there is no scope.
            base = example.scope_stack[-1] if example.scope_stack else example.name
            idx = seen.get(base, 0)
            seen[base] = idx + 1
            name = base if idx == 0 else f"{base}[{idx}]"
            yield OathItem.from_parent(
                self,
                name=name,
                example=example,
                run=run,
                source=source,
                oath_path=_oath_path(self.path, root),
                results=results,
            )

        # Reconcile drift against varar.lock.json: a clean run records/updates the
        # baseline; a paragraph that was an example and no longer matches any
        # step yields a failing item (unless --varar-update / VARAR_UPDATE accepts).
        oath_path = _oath_path(self.path, root)
        drifts = reconcile_drift(
            store,
            oath_path,
            source,
            execution_plan.doc,
            execution_plan,
            update=_update_mode(self.config),
        )
        for d in drifts:
            yield DriftItem.from_parent(
                self,
                name=f"varar:drift:{d.line}",
                message=drift_detected(d.name, d.span).message,
                line=d.line,
            )


class DriftItem(pytest.Item):
    """A failing item for a drifted paragraph — the pytest surface of the
    drift gate. Accept it with --varar-update / VARAR_UPDATE=1."""

    def __init__(self, *, message, line, **kw):
        super().__init__(**kw)
        self._message = message
        self._line = line

    def runtest(self) -> None:
        raise AssertionError(self._message)

    def repr_failure(self, excinfo: object) -> str:
        return self._message

    def reportinfo(self):
        return self.path, self._line - 1, self.name


class OathItem(pytest.Item):
    def __init__(self, *, example, run, source, oath_path, results, **kw):
        super().__init__(**kw)
        self._example = example
        self._run = run
        self._source = source
        self._oath_path = oath_path
        self._results = results
        self._token = None

    def setup(self) -> None:
        from _pytest.fixtures import TopRequest

        fm = self.session._fixturemanager
        self._fixtureinfo = fm.getfixtureinfo(node=self, func=None, cls=None)
        self.fixturenames = self._fixtureinfo.names_closure
        self.funcargs: dict = {}
        self._request = TopRequest(self, _ispytest=True)  # type: ignore[arg-type]
        self._token = _active_request.set(self._request)

    def runtest(self) -> None:
        # The example result is recorded here, where the error object is still
        # in hand — pytest's report carries only rendered text by the time the
        # session ends, and to_failure needs the exception itself to read the
        # anchor the executor attached to it.
        lines = tuple(dict.fromkeys(s.match_span.start_line for s in self._example.steps))
        try:
            self._run()
        except BaseException as error:
            self._results.record(
                self._oath_path,
                self._source,
                ExampleResult(
                    name=self._example.name,
                    status="failed",
                    lines=lines,
                    failure=to_failure(error, self._oath_path, lines[0] if lines else 0),
                ),
            )
            raise
        self._results.record(
            self._oath_path,
            self._source,
            ExampleResult(name=self._example.name, status="passed", lines=lines),
        )

    def teardown(self) -> None:
        if self._token is not None:
            _active_request.reset(self._token)
            self._token = None

    def repr_failure(self, excinfo: object) -> str:
        from varar_runner.render import render_failure

        return render_failure(excinfo.value, self._source, str(self.path))  # type: ignore[union-attr]

    def reportinfo(self):
        return self.path, self._example.span.start_line - 1, self.name

from __future__ import annotations

from pathlib import Path

import pytest

from var.matcher import find_hits
from var.sentences import split_sentences
from var_runner.config import read_var_config
from var_runner.discovery import match_spec
from var_runner.render import UndefinedStepError
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


def _first_unmatched_sentence(raw_ex: object, registry: object) -> str | None:
    """Return the text of the first sentence in *raw_ex* that has no hits in
    *registry*, or None if every sentence matches or the example has no
    text-bearing blocks at all."""
    for block in raw_ex.body:  # type: ignore[union-attr]
        if block.kind not in ("paragraph", "list_item", "blockquote"):
            continue
        for sentence in split_sentences(block.text):  # type: ignore[union-attr]
            if not find_hits(sentence.text, registry):  # type: ignore[arg-type]
                return sentence.text
    return None


class VarFile(pytest.File):
    def collect(self):
        _cfg, loaded, _root = _STASH[id(self.config)]
        source = self.path.read_text(encoding="utf-8")
        execution_plan = plan_spec(source, self.path.name, loaded.registry)
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
            yield VarItem.from_parent(self, name=name, example=example, run=run, source=source)

        # Yield failing items for examples that were dropped because no step
        # defs matched.  Only examples with at least one unmatched sentence are
        # surfaced; truly empty prose sections (no sentences) are left as docs.
        for raw_ex in execution_plan.dropped_examples:
            step_text = _first_unmatched_sentence(raw_ex, loaded.registry)
            if step_text is None:
                continue  # no text-bearing sentences → genuine plain docs
            base = raw_ex.scope_stack[-1] if raw_ex.scope_stack else "undefined"
            idx = seen.get(base, 0)
            seen[base] = idx + 1
            name = base if idx == 0 else f"{base}[{idx}]"

            def _make_undefined_run(text: str = step_text) -> object:
                def run() -> None:
                    raise UndefinedStepError(text)

                return run

            yield VarItem.from_parent(
                self,
                name=name,
                example=raw_ex,
                run=_make_undefined_run(),
                source=source,
            )


class VarItem(pytest.Item):
    def __init__(self, *, example, run, source, **kw):
        super().__init__(**kw)
        self._example = example
        self._run = run
        self._source = source

    def runtest(self) -> None:
        self._run()

    def repr_failure(self, excinfo: object) -> str:
        from var_runner.render import render_failure

        return render_failure(excinfo.value, self._source, str(self.path))  # type: ignore[union-attr]

    def reportinfo(self):
        return self.path, self._example.span.start_line - 1, self.name

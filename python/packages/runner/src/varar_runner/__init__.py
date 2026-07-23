"""Shared imperative-shell orchestration for var test runners."""

__version__ = "0.0.0"

from varar_runner.discovery import find_oaths, match_oath
from varar_runner.render import render_failure
from varar_runner.run import RecordingReporter, examples_with_runs, plan_oath
from varar_runner.steps import LoadedSteps, load_steps

__all__ = [
    "find_oaths",
    "match_oath",
    "load_steps",
    "LoadedSteps",
    "plan_oath",
    "examples_with_runs",
    "RecordingReporter",
    "render_failure",
]

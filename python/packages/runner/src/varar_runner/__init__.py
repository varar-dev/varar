"""Shared imperative-shell orchestration for var test runners."""

__version__ = "0.0.0"

from varar_runner.discovery import find_specs, match_spec
from varar_runner.render import render_failure
from varar_runner.run import RecordingReporter, examples_with_runs, plan_spec
from varar_runner.steps import LoadedSteps, load_steps

__all__ = [
    "find_specs",
    "match_spec",
    "load_steps",
    "LoadedSteps",
    "plan_spec",
    "examples_with_runs",
    "RecordingReporter",
    "render_failure",
]

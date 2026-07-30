"""Smoke-test: every public symbol is importable from the top-level package."""
from varar_runner import (
    find_oaths,
    match_oath,
    load_steps,
    LoadedSteps,
    plan_oath,
    examples_with_runs,
    RecordingReporter,
    render_failure,
)


def test_public_api_all_importable():
    assert callable(find_oaths)
    assert callable(match_oath)
    assert callable(load_steps)
    assert LoadedSteps
    assert callable(plan_oath)
    assert callable(examples_with_runs)
    assert RecordingReporter
    assert callable(render_failure)

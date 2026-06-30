"""Smoke-test: every public symbol is importable from the top-level package."""
from var_runner import (
    VarConfig,
    read_var_config,
    find_specs,
    match_spec,
    load_steps,
    LoadedSteps,
    plan_spec,
    examples_with_runs,
    RecordingReporter,
    render_failure,
)


def test_public_api_all_importable():
    assert VarConfig
    assert callable(read_var_config)
    assert callable(find_specs)
    assert callable(match_spec)
    assert callable(load_steps)
    assert LoadedSteps
    assert callable(plan_spec)
    assert callable(examples_with_runs)
    assert RecordingReporter
    assert callable(render_failure)

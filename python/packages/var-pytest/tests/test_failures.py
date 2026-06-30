"""test_failures.py — pytester-based tests for VarItem.repr_failure.

Tests:
- Cell-mismatch failure renders line number + expected/actual diff.
- Undefined-step failure names the unmatched step text.
"""

PYPROJECT = """
[tool.var]
vars = ["features/**/*.md"]
steps = ["steps/**/*.steps.py"]
"""

# ---------------------------------------------------------------------------
# Cell-mismatch fixtures (mirrors conformance bundle 07-row-check-mismatch)
# ---------------------------------------------------------------------------

CELL_MISMATCH_SPEC = """\
# Scoring

## A wrong score is caught

I report the score and grade.

| score | grade |
| ----- | ----- |
| 10    | A     |
"""

CELL_MISMATCH_STEPS = """\
from var import define_state
context, action, sensor = define_state(lambda: {})

@sensor("I report the score and grade")
def _(state, row=None):
    return {"score": "99", "grade": "A"}
"""

# ---------------------------------------------------------------------------
# Undefined-step fixtures
# ---------------------------------------------------------------------------

UNDEFINED_SPEC = """\
# My Feature

## My Example

I have a step with no matching def.
"""

# A steps file that defines state but registers NO step defs.
UNDEFINED_STEPS = """\
from var import define_state
context, action, sensor = define_state(lambda: {})
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_fixture(pytester, spec_content: str, steps_content: str) -> None:
    pytester.makepyprojecttoml(PYPROJECT)
    (pytester.path / "steps").mkdir(exist_ok=True)
    (pytester.path / "steps" / "spec.steps.py").write_text(
        steps_content.strip(), encoding="utf-8"
    )
    (pytester.path / "features").mkdir(exist_ok=True)
    (pytester.path / "features" / "spec.md").write_text(spec_content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_cell_mismatch_repr_failure_shows_line_and_diff(pytester):
    """repr_failure for CellMismatchError must include the markdown line number,
    the column name, and the expected/actual values."""
    _write_fixture(pytester, CELL_MISMATCH_SPEC, CELL_MISMATCH_STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(failed=1)
    # render_failure output: "line N | column 'score' — expected: '10', actual: '99'"
    result.stdout.fnmatch_lines(["*score*"])
    result.stdout.fnmatch_lines(["*expected*10*"])
    result.stdout.fnmatch_lines(["*actual*99*"])
    # A line-number reference must appear somewhere in the output.
    assert any("line" in line for line in result.stdout.lines)


def test_undefined_step_failure_names_step_text(pytester):
    """When a spec has a step text that matches no step definition, pytest must
    collect the example as a failed test item whose failure message names the
    unmatched step text."""
    _write_fixture(pytester, UNDEFINED_SPEC, UNDEFINED_STEPS)
    result = pytester.runpytest("-v")
    result.assert_outcomes(failed=1)
    # render_failure output: "Undefined step: I have a step with no matching def."
    result.stdout.fnmatch_lines(["*Undefined step*"])
    result.stdout.fnmatch_lines(["*no matching def*"])
